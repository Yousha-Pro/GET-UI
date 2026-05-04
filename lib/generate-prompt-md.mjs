export function generatePromptMarkdown(context) {
  const { normalized, metadata = {} } = context;
  const siteProfile = normalized.siteProfile || {};
  const brand = metadata.brand || "Extracted Design System";
  const productSurface = metadata.productSurface || siteProfile.productSurface || "web app";
  
  const colors = normalized.colorPalette.map(c => `- ${c.token}: ${c.value}${c.variable ? ` (CSS Var: ${c.variable})` : ""}`).join("\n");
  const typography = normalized.typographyScale.map(t => `- ${t.token}: ${t.value}${t.variable ? ` (CSS Var: ${t.variable})` : ""}`).join("\n");
  const spacing = normalized.spacingScale.map(s => `- ${s.token}: ${s.value}${s.variable ? ` (CSS Var: ${s.variable})` : ""}`).join("\n");

  const anatomyDescription = inferAnatomyDescription(normalized.structureSnippet);
  const anatomySection = anatomyDescription 
    ? `\n### Component Anatomy\nBased on the reference structure, the component consists of:\n${anatomyDescription}\n`
    : "";

  const componentSnippet = normalized.structureSnippet 
    ? `\n### Reference Structure\nUse this HTML structure as a reference for the component anatomy:\n\n\`\`\`html\n${normalized.structureSnippet}\n\`\`\`\n`
    : "";

  const implementationGoal = normalized.structureSnippet
    ? "implementing a component based on the provided reference structure"
    : "implementing a high-fidelity UI component";

  const architecture = normalized.architecture || "Semantic CSS";
  const cssVariablesBlock = generateCssVariableBlock(normalized);

  return `# UI Implementation Prompt: ${brand}

## Context
You are a senior frontend engineer tasked with ${implementationGoal} for ${brand}. The project is a ${productSurface}.
The codebase follows a **${architecture}** architecture.

## Design Tokens
Use the following extracted design tokens to ensure visual consistency:

### CSS Theme Variables
Copy this block into your global CSS file for instant setup:

\`\`\`css
${cssVariablesBlock}
\`\`\`

### Colors
${colors || "Define semantic colors based on brand intent."}

### Typography
${typography || "Use a standard typographic scale if not specified."}

### Spacing & Layout
${spacing || "Use a 4px or 8px grid system."}
${anatomySection}
${componentSnippet}
## Requirements
1. **Token Adherence**: Use the exact token values or CSS variables listed above.
2. **Accessibility**: Ensure WCAG 2.2 AA compliance. Use semantic HTML and aria-attributes.
3. **Responsiveness**: Implement mobile-first responsive design.
4. **State Handling**: Define styles for hover, focus-visible, active, and disabled states.

## Instructions
Please generate the React/Tailwind (or requested framework) code for the component. Focus on clean architecture, reusable patterns, and semantic accessibility.
`;
}

function inferAnatomyDescription(snippet) {
  if (!snippet) return null;

  const features = [];
  const lowSnippet = snippet.toLowerCase();

  if (lowSnippet.includes("<button")) features.push("- A primary interactive button element.");
  if (lowSnippet.includes("<input") || lowSnippet.includes("<textarea")) features.push("- Form input fields for user data entry.");
  if (lowSnippet.includes("<svg") || lowSnippet.includes("<img")) features.push("- Visual icons or imagery for context.");
  if (lowSnippet.includes("<nav") || lowSnippet.includes("<ul")) features.push("- Navigation structure or list-based layout.");
  if (lowSnippet.includes("card") || lowSnippet.includes("container")) features.push("- A contained box/card layout for grouping content.");
  if (lowSnippet.includes("<h1") || lowSnippet.includes("<h2") || lowSnippet.includes("<h3")) features.push("- Clear typographic hierarchy with headings.");

  return features.length > 0 ? features.join("\n") : "- A custom structural component layout.";
}

function generateCssVariableBlock(normalized) {
  const vars = [];
  
  normalized.colorPalette.forEach(c => {
    const varName = c.token.replace(/\./g, "-");
    vars.push(`  --${varName}: ${c.value};`);
  });

  normalized.typographyScale.forEach(t => {
    const varName = t.token.replace(/\./g, "-");
    vars.push(`  --${varName}: ${t.value};`);
  });

  normalized.spacingScale.forEach(s => {
    const varName = s.token.replace(/\./g, "-");
    vars.push(`  --${varName}: ${s.value};`);
  });

  return `:root {\n${vars.join("\n")}\n}`;
}
