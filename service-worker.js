import { normalizeExtractedStyles } from "./lib/normalize.mjs";
import { generateDesignMarkdown } from "./lib/generate-design-md.mjs";
import { generateSkillMarkdown } from "./lib/generate-skill-md.mjs";
import { generatePromptMarkdown } from "./lib/generate-prompt-md.mjs";
import { validateMarkdownOutput } from "./lib/validate.mjs";

const EXTRACTION_MESSAGE = "TYPEUI_EXTRACT_STYLES";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    outputMode: "design"
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) {
    return;
  }

  if (message.type === "RUN_EXTRACTION") {
    handleExtraction(message)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: stringifyError(error) }));
    return true;
  }

  if (message.type === "START_INSPECTION") {
    handleStartInspection()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: stringifyError(error) }));
    return true;
  }

  if (message.type === "TYPEUI_INSPECT_RESULT") {
    handleInspectResult(message);
    return;
  }

  if (message.type === "DOWNLOAD_MARKDOWN") {
    handleDownload(message)
      .then((downloadId) => sendResponse({ ok: true, downloadId }))
      .catch((error) => sendResponse({ ok: false, error: stringifyError(error) }));
    return true;
  }
});

async function handleExtraction(message) {
  const mode = normalizeMode(message.mode);
  const tab = await getActiveTab();
  await injectExtractor(tab.id);
  const payload = await requestExtractionPayload(tab.id);
  const normalized = normalizeExtractedStyles(payload);

  const context = {
    normalized
  };

  const designMd = cleanOutput(generateDesignMarkdown(context));
  const skillMd = generateSkillMarkdown(context); // SKILL.md has its own header/frontmatter logic
  const promptMd = cleanOutput(generatePromptMarkdown(context));

  const markdown = mode === "skill" ? skillMd : mode === "prompt" ? promptMd : designMd;
  const validation = validateMarkdownOutput(mode, markdown);
  const filename = mode === "skill" ? "SKILL.md" : mode === "prompt" ? "PROMPT.md" : "DESIGN.md";

  if (message.persistOutputMode !== false) {
    await chrome.storage.local.set({
      outputMode: mode
    });
  }

  return {
    mode,
    filename,
    markdown,
    artifacts: {
      design: designMd,
      skill: skillMd,
      prompt: promptMd
    },
    normalized,
    validation
  };
}

async function handleStartInspection() {
  const tab = await getActiveTab();
  await injectExtractor(tab.id);
  await chrome.tabs.sendMessage(tab.id, { type: "TYPEUI_START_INSPECT" });
}

async function handleInspectResult(message) {
  if (!message.ok) {
    await chrome.storage.local.set({ lastError: message.error });
    return;
  }

  try {
    const data = await chrome.storage.local.get(["outputMode"]);
    const mode = normalizeMode(data.outputMode);
    const normalized = normalizeExtractedStyles(message.payload);

    const context = { normalized };
    const designMd = cleanOutput(generateDesignMarkdown(context));
    const skillMd = generateSkillMarkdown(context);
    const promptMd = cleanOutput(generatePromptMarkdown(context));

    const markdown = mode === "skill" ? skillMd : mode === "prompt" ? promptMd : designMd;
    const validation = validateMarkdownOutput(mode, markdown);
    
    const result = {
      mode,
      filename: mode === "skill" ? "SKILL.md" : mode === "prompt" ? "PROMPT.md" : "DESIGN.md",
      markdown,
      artifacts: {
        design: designMd,
        skill: skillMd,
        prompt: promptMd
      },
      normalized,
      validation,
      timestamp: Date.now()
    };

    await chrome.storage.local.set({ lastInspectResult: result, lastError: null });
    
  } catch (error) {
    await chrome.storage.local.set({ lastError: stringifyError(error) });
  }
}

function normalizeMode(mode) {
  if (mode === "skill" || mode === "prompt") {
    return mode;
  }
  return "design";
}

function generateMarkdownByMode(mode, context) {
  switch (mode) {
    case "skill":
      return generateSkillMarkdown(context);
    case "prompt":
      return generatePromptMarkdown(context);
    default:
      return generateDesignMarkdown(context);
  }
}

async function handleDownload(message) {
  if (!message.markdown) {
    throw new Error("Cannot download empty markdown.");
  }

  const filename = normalizeMarkdownFilename(message.filename, message.mode);
  const url = `data:text/markdown;charset=utf-8,${encodeURIComponent(message.markdown)}`;
  return chrome.downloads.download({
    url,
    filename,
    saveAs: true,
    conflictAction: "uniquify"
  });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });
  if (!tab || !tab.id) {
    throw new Error("No active tab available.");
  }
  if (String(tab.url || "").startsWith("chrome://")) {
    throw new Error("Extraction is not available on chrome:// pages.");
  }
  return tab;
}

async function injectExtractor(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content-script.js"]
  });
}

function requestExtractionPayload(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: EXTRACTION_MESSAGE }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response || !response.ok) {
        reject(new Error(response?.error || "No extraction response from tab."));
        return;
      }
      resolve(response.payload);
    });
  });
}

function stringifyError(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || "Unknown error");
}

function cleanOutput(markdown) {
  if (!markdown) return "";
  
  // Remove the specific header requested by the user
  const headerPattern = /<!-- GET-UI_HEADER_START -->[\s\S]*?<!-- GET-UI_HEADER_END -->/g;
  const legacyHeaderPattern = /<!-- GET-UI_HEADER_START -->[\s\S]*?<\/div>/g;
  
  return markdown
    .replace(headerPattern, "")
    .replace(legacyHeaderPattern, "")
    .trim();
}

function normalizeMarkdownFilename(inputName, mode) {
  const normalizedMode = normalizeMode(mode);
  const fallback = normalizedMode === "skill" ? "SKILL.md" : normalizedMode === "prompt" ? "PROMPT.md" : "DESIGN.md";
  const raw = String(inputName || "").trim();

  if (!raw) {
    return fallback;
  }

  const name = raw.replace(/[\\/]/g, "").trim();
  if (!name) {
    return fallback;
  }

  if (normalizedMode === "skill") {
    if (/^skill(\.md)?$/i.test(name)) {
      return "SKILL.md";
    }
    return name.toLowerCase().endsWith(".md") ? name : `${name}.md`;
  }

  if (normalizedMode === "prompt") {
    if (/^prompt(\.md)?$/i.test(name)) {
      return "PROMPT.md";
    }
    return name.toLowerCase().endsWith(".md") ? name : `${name}.md`;
  }

  if (/^design(\.md)?$/i.test(name)) {
    return "DESIGN.md";
  }
  return name.toLowerCase().endsWith(".md") ? name : `${name}.md`;
}
