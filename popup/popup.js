const state = {
  markdown: "",
  filename: "",
  mode: "design", // design, skill, or prompt
  busy: false,
  lastResult: null
};

const QUICK_INSTALL_PROVIDERS = {
  claude: {
    label: "Claude Code",
    targetDir: ".claude/skills/design-system"
  },
  codex: {
    label: "Codex",
    targetDir: ".agents/skills/design-system"
  },
  cursor: {
    label: "Cursor",
    targetDir: ".cursor/skills/design-system"
  }
};

const appEl = document.querySelector(".app");
const modeButtons = Array.from(document.querySelectorAll("[data-mode]"));
const refreshBtn = document.getElementById("refreshBtn");
const selectAreaBtn = document.getElementById("selectAreaBtn");
const downloadBtn = document.getElementById("downloadBtn");
const copyBtn = document.getElementById("copyBtn");
const quickInstallButtons = Array.from(document.querySelectorAll(".quick-install-btn"));
const quickInstallResultEl = document.getElementById("quickInstallResult");
const helpBtn = document.getElementById("helpBtn");
const helpPanel = document.getElementById("helpPanel");
const helpContentEl = document.getElementById("helpContent");
const closeHelpBtn = document.getElementById("closeHelpBtn");
const previewEl = document.getElementById("preview");
const statusEl = document.getElementById("status");
const issuesEl = document.getElementById("issues");
const loadingStateEl = document.getElementById("loadingState");
const quickInstallToggleBtn = document.getElementById("quickInstallToggleBtn");
const quickInstallContentEl = document.getElementById("quickInstallContent");

refreshBtn.addEventListener("click", () => {
  runExtraction().catch((error) => setStatus(toErrorText(error), true));
});

selectAreaBtn.addEventListener("click", () => {
  startAreaSelection().catch((error) => setStatus(toErrorText(error), true));
});

for (const button of modeButtons) {
  button.addEventListener("click", () => {
    const mode = button.dataset.mode;
    if (!mode || mode === state.mode) {
      return;
    }
    state.mode = mode;
    syncModeUi();
    
    if (state.lastResult && state.lastResult.artifacts) {
      updateViewFromArtifacts();
    } else {
      runExtraction().catch((error) => setStatus(toErrorText(error), true));
    }
  });
}

function updateViewFromArtifacts() {
  if (!state.lastResult || !state.lastResult.artifacts) return;
  
  const artifacts = state.lastResult.artifacts;
  let markdown = "";
  let filename = "";
  
  if (state.mode === "skill") {
    markdown = artifacts.skill;
    filename = "SKILL.md";
  } else if (state.mode === "prompt") {
    markdown = artifacts.prompt;
    filename = "PROMPT.md";
  } else {
    markdown = artifacts.design;
    filename = "DESIGN.md";
  }
  
  state.markdown = markdown;
  state.filename = filename;
  previewEl.value = markdown;
}

for (const button of quickInstallButtons) {
  button.addEventListener("click", () => {
    const providerId = button.dataset.provider;
    installQuick(providerId).catch((error) => {
      setQuickInstallResult(`Quick install failed: ${toErrorText(error)}`, true);
    });
  });
}

downloadBtn.addEventListener("click", () => {
  downloadCurrent().catch((error) => setStatus(toErrorText(error), true));
});

helpBtn.addEventListener("click", () => {
  const shouldOpen = helpPanel.hidden;
  helpPanel.hidden = !shouldOpen;
  appEl.classList.toggle("is-explaining", shouldOpen);

  if (shouldOpen) {
    renderGenerationExplanation();
  }
});

closeHelpBtn.addEventListener("click", () => {
  helpPanel.hidden = true;
  appEl.classList.remove("is-explaining");
});

quickInstallToggleBtn.addEventListener("click", () => {
  const expanded = quickInstallToggleBtn.getAttribute("aria-expanded") === "true";
  quickInstallToggleBtn.setAttribute("aria-expanded", expanded ? "false" : "true");
  quickInstallContentEl.hidden = expanded;
});

copyBtn.addEventListener("click", async () => {
  try {
    if (!state.markdown) {
      setStatus("Nothing to copy yet.", true);
      return;
    }
    await navigator.clipboard.writeText(state.markdown);
    
    copyBtn.classList.add("copied");
    const copyIcon = copyBtn.querySelector(".icon-copy");
    const successIcon = copyBtn.querySelector(".icon-success");
    if (copyIcon && successIcon) {
      copyIcon.style.display = "none";
      successIcon.style.display = "block";
      setTimeout(() => {
        copyBtn.classList.remove("copied");
        copyIcon.style.display = "block";
        successIcon.style.display = "none";
      }, 2000);
    }
    launchConfetti(copyBtn);
  } catch (error) {
    setStatus(`Copy failed: ${toErrorText(error)}`, true);
  }
});

init().catch((error) => setStatus(`Init failed: ${toErrorText(error)}`, true));

const onboardingOverlay = document.getElementById("onboardingOverlay");
const onboardingHighlight = document.getElementById("onboardingHighlight");
const onboardingTooltip = document.getElementById("onboardingTooltip");
const onboardingContent = document.getElementById("onboardingContent");
const onboardingSkipBtn = document.getElementById("onboardingSkipBtn");
const onboardingNextBtn = document.getElementById("onboardingNextBtn");
const footnote = document.querySelector(".footnote");

let currentOnboardingStep = 0;
const onboardingSteps = [
  {
    title: "Welcome to GET-UI!",
    content: "Generate clean UI blueprints from any page in seconds. Let's take a quick tour of the key features.",
    target: null // Center screen
  },
  {
    title: "Output Modes",
    content: "Choose between DESIGN.md for documentation, SKILL.md for AI agents, or PROMPT.md for implementation prompts.",
    target: ".mode-switch"
  },
  {
    title: "Select Arena",
    content: "Click this to select a specific part of the page. Perfect for extracting single components like buttons or cards.",
    target: "#selectAreaBtn"
  },
  {
    title: "Full Page Refresh",
    content: "Run a complete scan of the entire page to capture all design tokens and structural signals.",
    target: "#refreshBtn"
  },
  {
    title: "Explain the Logic",
    content: "Curious how we got these results? This button shows you exactly how the extraction was performed.",
    target: "#helpBtn"
  },
  {
    title: "Export & Copy",
    content: "Once you're happy with the results, copy them to your clipboard or download them as a file.",
    target: ".action-row"
  },
  {
    title: "Quick Install",
    content: "Instantly deploy your blueprints into your favorite AI agent's skill directory.",
    target: ".quick-install"
  }
];

onboardingSkipBtn.addEventListener("click", finishOnboarding);
onboardingNextBtn.addEventListener("click", nextOnboardingStep);
footnote.addEventListener("click", () => startOnboarding(true));

async function init() {
  const data = await chrome.storage.local.get(["outputMode", "lastInspectResult", "lastError", "onboardingSeen"]);
  state.mode = data.outputMode === "skill" ? "skill" : "design";
  syncModeUi();
  updateQuickInstallUi();

  if (data.lastError) {
    setStatus(data.lastError, true);
    await chrome.storage.local.remove("lastError");
  }

  if (data.lastInspectResult) {
    applyExtractionResult(data.lastInspectResult);
    await chrome.storage.local.remove("lastInspectResult");
  } else {
    await runExtraction();
  }

  if (!data.onboardingSeen) {
    startOnboarding();
  }
}

function startOnboarding(force = false) {
  currentOnboardingStep = 0;
  onboardingOverlay.hidden = false;
  showOnboardingStep(0);
}

function nextOnboardingStep() {
  currentOnboardingStep++;
  if (currentOnboardingStep < onboardingSteps.length) {
    showOnboardingStep(currentOnboardingStep);
  } else {
    finishOnboarding();
  }
}

async function finishOnboarding() {
  onboardingOverlay.hidden = true;
  await chrome.storage.local.set({ onboardingSeen: true });
}

function showOnboardingStep(index) {
  const step = onboardingSteps[index];
  onboardingContent.innerHTML = `<h3>${step.title}</h3><p>${step.content}</p>`;
  onboardingNextBtn.textContent = index === onboardingSteps.length - 1 ? "Finish" : "Next";

  if (step.target) {
    const targetEl = document.querySelector(step.target);
    if (targetEl) {
      const rect = targetEl.getBoundingClientRect();
      const padding = 8;
      
      onboardingHighlight.style.top = `${rect.top - padding}px`;
      onboardingHighlight.style.left = `${rect.left - padding}px`;
      onboardingHighlight.style.width = `${rect.width + padding * 2}px`;
      onboardingHighlight.style.height = `${rect.height + padding * 2}px`;
      onboardingHighlight.style.opacity = "1";

      // Position tooltip
      const tooltipRect = onboardingTooltip.getBoundingClientRect();
      let top = rect.bottom + 16;
      let left = rect.left + (rect.width / 2) - (280 / 2);

      // Keep tooltip in viewport
      if (left < 10) left = 10;
      if (left + 280 > 418) left = 418 - 280;
      if (top + 150 > 570) top = rect.top - 170;

      onboardingTooltip.style.top = `${top}px`;
       onboardingTooltip.style.left = `${left}px`;
       onboardingTooltip.style.transform = "none";
     }
   } else {
    // Center onboarding
    onboardingHighlight.style.opacity = "0";
    onboardingTooltip.style.top = "50%";
    onboardingTooltip.style.left = "50%";
    onboardingTooltip.style.transform = "translate(-50%, -50%)";
  }
}

async function startAreaSelection() {
  const response = await chrome.runtime.sendMessage({ type: "START_INSPECTION" });
  if (!response || !response.ok) {
    throw new Error(response?.error || "Failed to start inspection mode.");
  }
  window.close(); // Close popup so user can select area
}

function applyExtractionResult(result) {
  state.markdown = result.markdown;
  state.filename = result.filename;
  state.lastResult = result;

  previewEl.value = result.markdown;
  downloadBtn.disabled = false;
  copyBtn.disabled = false;

  renderValidationIssues(result.validation);
  clearQuickInstallResult();
  updateQuickInstallUi();
  if (!helpPanel.hidden) {
    renderGenerationExplanation();
  }
}

async function runExtraction() {
  if (state.busy) {
    return;
  }
  setBusy(true);

  try {
    const response = await chrome.runtime.sendMessage({
      type: "RUN_EXTRACTION",
      mode: state.mode
    });

    if (!response || !response.ok) {
      throw new Error(response?.error || "Extraction request failed.");
    }

    applyExtractionResult(response);
  } catch (error) {
    setStatus(toErrorText(error), true);
  } finally {
    setBusy(false);
  }
}

async function downloadCurrent() {
  if (!state.markdown || !state.filename) {
    setStatus("Nothing to download yet.", true);
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: "DOWNLOAD_MARKDOWN",
    mode: state.mode,
    filename: state.filename,
    markdown: state.markdown
  });

  if (!response || !response.ok) {
    throw new Error(response?.error || "Download failed.");
  }
  setStatus(`Saved ${state.filename}.`, false, true);
  launchConfetti(downloadBtn);
}

function setBusy(isBusy) {
  state.busy = isBusy;
  refreshBtn.disabled = isBusy;
  for (const button of modeButtons) {
    button.disabled = isBusy;
  }
  if (loadingStateEl) {
    loadingStateEl.hidden = !isBusy;
  }
  updateQuickInstallUi();
}

function renderValidationIssues(validation) {
  issuesEl.innerHTML = "";
  if (!validation) {
    issuesEl.hidden = true;
    return;
  }

  const issues = [
    ...(validation.errors || []),
    ...(validation.warnings || [])
  ];

  if (issues.length === 0) {
    issuesEl.hidden = true;
    return;
  }

  issuesEl.hidden = false;
  for (const issue of issues) {
    const item = document.createElement("li");
    item.textContent = issue;
    issuesEl.appendChild(item);
  }
}

function setStatus(text, isError = false, isSuccess = false) {
  const value = String(text || "").trim();
  if (!value) {
    clearStatus();
    return;
  }
  statusEl.hidden = false;
  statusEl.textContent = value;
  statusEl.classList.toggle("error", Boolean(isError));
  statusEl.classList.toggle("success", Boolean(isSuccess && !isError));
}

function toErrorText(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || "Unknown error");
}

function syncModeUi() {
  for (const button of modeButtons) {
    const isActive = button.dataset.mode === state.mode;
    button.classList.toggle("is-active", isActive);
  }
  clearQuickInstallResult();
  updateQuickInstallUi();
  if (!helpPanel.hidden) {
    renderGenerationExplanation();
  }
}

function renderGenerationExplanation() {
  const modeLabel = 
    state.mode === "skill" ? "SKILL.md" : 
    state.mode === "prompt" ? "PROMPT.md" : "DESIGN.md";
  const result = state.lastResult;

  if (!result) {
    helpContentEl.innerHTML = `
      <div style="text-align: center; padding: 20px; color: var(--muted);">
        <p>No extraction result is loaded yet.</p>
        <p style="font-size: 11px;">Run extraction and open this panel again for a full breakdown.</p>
      </div>
    `;
    return;
  }

  const normalized = result.normalized || {};
  const siteProfile = normalized.siteProfile || {};
  const checks = result.validation?.checks || [];
  const passedChecks = checks.filter((item) => item.ok).length;

  const summary = {
    sampledElements: normalized.sampledElements ?? "n/a",
    totalElements: normalized.totalElements ?? "n/a",
    typographyTokens: (normalized.typographyScale || []).length,
    colorTokens: (normalized.colorPalette || []).length,
    spacingTokens: (normalized.spacingScale || []).length,
    radiusTokens: (normalized.radiusTokens || []).length,
    shadowTokens: (normalized.shadowTokens || []).length,
    motionTokens: (normalized.motionDurationTokens || []).length + (normalized.motionEasingTokens || []).length
  };

  const componentHints = (normalized.componentHints || [])
    .slice(0, 5)
    .map((item) => `${item.type}: ${item.count}`)
    .join(", ");

  const inferenceEvidence = (siteProfile.evidence || []).slice(0, 5).join("; ");
  const inferenceText = siteProfile.audience || siteProfile.productSurface
    ? `Audience "${escapeHtml(siteProfile.audience || "n/a")}" and surface "${escapeHtml(siteProfile.productSurface || "n/a")}" inferred with ${escapeHtml(siteProfile.confidence || "unknown")} confidence.`
    : "Audience and product surface fallback values were used because evidence confidence was low.";

  helpContentEl.innerHTML = `
    <div class="help-step">
      <div class="help-step-header">
        <span class="help-step-num">1</span>
        <span class="help-step-title">Style Extraction</span>
      </div>
      <div class="help-step-body">
        The extension scans visible elements to capture computed typography, colors, spacing, and motion values.
        <div class="help-step-stats">
          <span class="help-badge">${escapeHtml(String(summary.sampledElements))} Elements</span>
          <span class="help-badge">${escapeHtml(String(summary.totalElements))} Nodes</span>
        </div>
      </div>
    </div>

    <div class="help-step">
      <div class="help-step-header">
        <span class="help-step-num">2</span>
        <span class="help-step-title">Token Normalization</span>
      </div>
      <div class="help-step-body">
        Raw values are deduplicated and grouped into semantic-like token sets to create reusable foundations.
        <div class="help-step-stats">
          <span class="help-badge">Colors: ${escapeHtml(String(summary.colorTokens))}</span>
          <span class="help-badge">Text: ${escapeHtml(String(summary.typographyTokens))}</span>
          <span class="help-badge">Space: ${escapeHtml(String(summary.spacingTokens))}</span>
        </div>
      </div>
    </div>

    <div class="help-step">
      <div class="help-step-header">
        <span class="help-step-num">3</span>
        <span class="help-step-title">Website Profiling</span>
      </div>
      <div class="help-step-body">
        Uses metadata, path patterns, and structural signals to infer brand context and product surface.
        <p style="margin: 4px 0 0; font-size: 10.5px;">${escapeHtml(inferenceText)}</p>
        ${inferenceEvidence ? `<p style="margin: 4px 0 0; font-size: 10.5px; opacity: 0.7;">Evidence: ${escapeHtml(inferenceEvidence)}</p>` : ""}
      </div>
    </div>

    <div class="help-step">
      <div class="help-step-header">
        <span class="help-step-num">4</span>
        <span class="help-step-title">Blueprint Assembly</span>
      </div>
      <div class="help-step-body">
        Content is assembled into required sections for ${modeLabel}, including accessibility, rule sets, and quality gates.
        ${componentHints ? `<p style="margin: 4px 0 0; font-size: 10.5px;">Density: ${escapeHtml(componentHints)}</p>` : ""}
      </div>
    </div>

    <div class="help-step">
      <div class="help-step-header">
        <span class="help-step-num">5</span>
        <span class="help-step-title">Conformance Checks</span>
      </div>
      <div class="help-step-body">
        The file is validated against required headings, accessibility wording, and state references.
        <div class="help-step-stats">
          <span class="help-badge" style="background: ${passedChecks === checks.length ? "#dcfce7" : "#fef9c3"}; color: ${passedChecks === checks.length ? "#166534" : "#854d0e"};">
            ${escapeHtml(String(passedChecks))}/${escapeHtml(String(checks.length))} Checks Passed
          </span>
        </div>
      </div>
    </div>

    <div class="help-footer">
      Generated blueprint for <strong>${modeLabel}</strong> is ready for implementation.
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clearStatus() {
  statusEl.textContent = "";
  statusEl.hidden = true;
  statusEl.classList.remove("error", "success");
}

async function installQuick(providerId) {
  const provider = QUICK_INSTALL_PROVIDERS[providerId];
  if (!provider) {
    setQuickInstallResult("Unknown provider.", true);
    return;
  }
  if (state.busy) {
    return;
  }
  clearQuickInstallResult();
  clearStatus();

  const relativePath = `${provider.targetDir}/SKILL.md`;
  setBusy(true);

  try {
    const skillMarkdown = await fetchSkillMarkdownForInstall();

    if (typeof window.showDirectoryPicker !== "function") {
      await fallbackQuickInstall(provider, relativePath, skillMarkdown);
      return;
    }

    try {
      const rootHandle = await window.showDirectoryPicker({ mode: "readwrite" });
      await writeFileToProject(rootHandle, relativePath, skillMarkdown);
      setQuickInstallResult(`Installed for ${provider.label} at ${provider.targetDir}/`);
    } catch (error) {
      if (isAbortError(error)) {
        setQuickInstallResult("Quick install cancelled.");
        return;
      }
      await fallbackQuickInstall(provider, relativePath, skillMarkdown, error);
    }
  } finally {
    setBusy(false);
  }
}

async function fetchSkillMarkdownForInstall() {
  const response = await chrome.runtime.sendMessage({
    type: "RUN_EXTRACTION",
    mode: "skill",
    persistOutputMode: false
  });

  if (!response || !response.ok || !response.markdown) {
    throw new Error(response?.error || "Could not generate SKILL.md for quick install.");
  }
  return response.markdown;
}

async function writeFileToProject(rootHandle, relativePath, content) {
  const parts = relativePath.split("/").filter(Boolean);
  const fileName = parts.pop();
  if (!fileName) {
    throw new Error("Invalid target path.");
  }

  let currentDir = rootHandle;
  for (const segment of parts) {
    currentDir = await currentDir.getDirectoryHandle(segment, { create: true });
  }

  const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function fallbackQuickInstall(provider, relativePath, skillMarkdown, originalError) {
  let copied = false;
  let downloaded = false;

  try {
    await navigator.clipboard.writeText(skillMarkdown);
    copied = true;
  } catch (_) {
    copied = false;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: "DOWNLOAD_MARKDOWN",
      mode: "skill",
      filename: "SKILL.md",
      markdown: skillMarkdown
    });
    downloaded = Boolean(response?.ok);
  } catch (_) {
    downloaded = false;
  }

  if (copied || downloaded) {
    setQuickInstallResult(
      `${copied ? "Copied content." : "Could not copy."} ${downloaded ? "Downloaded SKILL.md." : "Could not auto-download."} Move it to <project>/${relativePath} for ${provider.label}.`,
      false
    );
    return;
  }

  const reason = originalError ? ` (${toErrorText(originalError)})` : "";
  setQuickInstallResult(`Quick install failed${reason}.`, true);
}

function updateQuickInstallUi() {
  const enabled = !state.busy;

  for (const button of quickInstallButtons) {
    button.disabled = !enabled;
  }
}

function setQuickInstallResult(text, isError = false) {
  const value = String(text || "").trim();
  if (!value) {
    clearQuickInstallResult();
    return;
  }

  quickInstallResultEl.hidden = false;
  quickInstallResultEl.textContent = value;
  quickInstallResultEl.classList.toggle("error", Boolean(isError));
}

function clearQuickInstallResult() {
  quickInstallResultEl.hidden = true;
  quickInstallResultEl.textContent = "";
  quickInstallResultEl.classList.remove("error");
}

function isAbortError(error) {
  return error && typeof error === "object" && error.name === "AbortError";
}

function launchConfetti(anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const container = document.createElement("div");
  container.className = "confetti-container";
  const colors = ["#2563eb", "#10b981", "#f59e0b", "#ef4444"];

  for (let i = 0; i < 12; i += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.left = `${cx + (Math.random() * 24 - 12)}px`;
    piece.style.top = `${cy + (Math.random() * 8 - 4)}px`;
    piece.style.background = colors[i % colors.length];
    container.appendChild(piece);
  }

  document.body.appendChild(container);
  setTimeout(() => container.remove(), 700);
}
