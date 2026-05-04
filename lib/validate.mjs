const REQUIRED_HEADINGS = [
  "## Mission",
  "## Brand",
  "## Style Foundations",
  "## Accessibility",
  "## Writing Tone",
  "## Rules: Do",
  "## Rules: Don't",
  "## Guideline Authoring Workflow",
  "## Required Output Structure",
  "## Component Rule Expectations",
  "## Quality Gates"
];

const REQUIRED_STATES = [
  "default",
  "hover",
  "focus-visible",
  "active",
  "disabled",
  "loading",
  "error"
];

/**
 * @param {string} mode
 * @param {string} markdown
 */
export function validateMarkdownOutput(mode, markdown) {
  const errors = [];
  const warnings = [];
  const checks = [];

  if (mode === "prompt") {
    runCheck(markdown.includes("# UI Implementation Prompt"), "Prompt title exists", checks, errors);
    runCheck(markdown.includes("## Context"), "Context section exists", checks, errors);
    runCheck(markdown.includes("## Design Tokens"), "Tokens section exists", checks, errors);
    return { isValid: errors.length === 0, errors, warnings, checks };
  }

  if (mode === "skill") {
    const hasHeader = markdown.startsWith("Generated Markdown");
    const content = hasHeader ? markdown.replace(/^Generated Markdown\s+/, "") : markdown;
    runCheck(content.startsWith("---"), "Frontmatter block exists", checks, errors);
    runCheck(markdown.includes("name: design-system-"), "Frontmatter includes design-system name", checks, errors);
    runCheck(markdown.includes("description:"), "Frontmatter includes description", checks, errors);
    runCheck(
      markdown.includes("<!-- GET_UI_MANAGED_START -->") &&
        markdown.includes("<!-- GET_UI_MANAGED_END -->"),
      "Managed block markers exist",
      checks,
      errors
    );
  }

  for (const heading of REQUIRED_HEADINGS) {
    runCheck(markdown.includes(heading), `Required section present: ${heading}`, checks, errors);
  }

  for (const state of REQUIRED_STATES) {
    if (!markdown.toLowerCase().includes(state)) {
      warnings.push(`Missing explicit state mention: ${state}`);
    }
  }

  if (!markdown.includes("WCAG 2.2 AA")) {
    errors.push("Accessibility target 'WCAG 2.2 AA' is missing.");
  } else {
    checks.push({ label: "Accessibility target included", ok: true });
  }

  if (!markdown.includes("must")) {
    warnings.push("No 'must' wording detected for non-negotiable rules.");
  } else {
    checks.push({ label: "Contains non-negotiable rule wording", ok: true });
  }

  if (!markdown.includes("should")) {
    warnings.push("No 'should' wording detected for recommendation rules.");
  } else {
    checks.push({ label: "Contains recommendation wording", ok: true });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    checks
  };
}

function runCheck(condition, label, checks, errors) {
  if (condition) {
    checks.push({ label, ok: true });
    return;
  }
  checks.push({ label, ok: false });
  errors.push(label);
}
