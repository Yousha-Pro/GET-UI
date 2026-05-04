const SIZE_NAMES = ["xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl"];
const RADIUS_NAMES = ["xs", "sm", "md", "lg", "xl", "2xl"];
const SURFACE_NAMES = ["base", "muted", "raised", "strong"];
const TEXT_NAMES = ["primary", "secondary", "tertiary", "inverse"];
const BORDER_NAMES = ["default", "muted", "strong"];
const MOTION_NAMES = ["instant", "fast", "normal", "slow", "slower"];

/**
 * @typedef {Object} TokenRow
 * @property {string} token
 * @property {string} value
 * @property {number} [usage]
 * @property {string} [variable]
 */

/**
 * @typedef {Object} MainFontStyle
 * @property {string} familyStack
 * @property {string} primaryFamily
 * @property {string} weight
 * @property {string} size
 * @property {string} lineHeight
 * @property {number} usage
 * @property {string} confidence
 */

/**
 * @typedef {Object} ExtractionPayload
 * @property {Object} source
 * @property {string} source.url
 * @property {string} source.title
 * @property {string} sampledAt
 * @property {number} totalElements
 * @property {number} sampledElements
 * @property {Array<{fontFamily: string, fontSize: string, lineHeight: string, fontWeight: string}>} [typography]
 * @property {Array<{textColor: string, backgroundColor: string, borderColor: string, outlineColor: string}>} [colors]
 * @property {Array<Object>} [spacing]
 * @property {Array<string>} [radius]
 * @property {Array<string>} [shadows]
 * @property {Array<Object>} [motion]
 * @property {Array<{name: string, value: string}>} [cssVariables]
 * @property {Array<{type: string, count: number}>} [components]
 * @property {Object} [siteSignals]
 */

/**
 * @param {ExtractionPayload} payload
 */
export function normalizeExtractedStyles(payload) {
  const typographyMap = new Map();
  const fontFamilyMap = new Map();
  const textColorMap = new Map();
  const backgroundColorMap = new Map();
  const borderColorMap = new Map();
  const focusColorMap = new Map();
  const spacingMap = new Map();
  const radiusMap = new Map();
  const shadowMap = new Map();
  const motionDurationMap = new Map();
  const motionEasingMap = new Map();

  for (const row of payload.typography || []) {
    const fontSize = parsePx(row.fontSize);
    if (fontSize !== null) {
      increment(typographyMap, String(fontSize));
    }

    const fontFamily = normalizeFontFamilyStack(row.fontFamily);
    if (fontFamily) {
      increment(fontFamilyMap, fontFamily);
    }
  }

  for (const row of payload.colors || []) {
    const text = toCanonicalColor(row.textColor);
    const bg = toCanonicalColor(row.backgroundColor);
    const border = toCanonicalColor(row.borderColor);
    const outline = toCanonicalColor(row.outlineColor);

    if (text && !isTransparent(text)) {
      increment(textColorMap, text);
    }
    if (bg && !isTransparent(bg)) {
      increment(backgroundColorMap, bg);
    }
    if (border && !isTransparent(border)) {
      increment(borderColorMap, border);
    }
    if (outline && !isTransparent(outline)) {
      increment(focusColorMap, outline);
    }
  }

  for (const row of payload.spacing || []) {
    const values = [
      row.marginTop,
      row.marginRight,
      row.marginBottom,
      row.marginLeft,
      row.paddingTop,
      row.paddingRight,
      row.paddingBottom,
      row.paddingLeft
    ];
    for (const raw of values) {
      const px = parsePx(raw);
      if (px !== null && px > 0) {
        increment(spacingMap, String(px));
      }
    }
  }

  for (const value of payload.radius || []) {
    const px = parsePx(value);
    if (px !== null && px > 0) {
      increment(radiusMap, String(px));
    }
  }

  for (const value of payload.shadows || []) {
    const normalized = normalizeWhitespace(value);
    if (normalized && normalized !== "none") {
      increment(shadowMap, normalized);
    }
  }

  for (const row of payload.motion || []) {
    const duration = parseDuration(row.transitionDuration) ?? parseDuration(row.animationDuration);
    const easing = normalizeWhitespace(row.transitionTimingFunction || row.animationTimingFunction);

    if (duration !== null && duration > 0) {
      increment(motionDurationMap, String(duration));
    }
    if (easing && easing !== "ease") {
      increment(motionEasingMap, easing);
    }
  }

  const typographyScale = toTokenRows(sortNumericKeys(typographyMap), SIZE_NAMES, "font.size");
  const mainFontStyle = inferMainFontStyle(payload.typography || [], fontFamilyMap);
  const spacingScale = toTokenRows(sortNumericKeys(spacingMap), [], "space", true);
  const radiusTokens = toTokenRows(sortNumericKeys(radiusMap), RADIUS_NAMES, "radius");
  const shadowTokens = toRankedTokenRows(shadowMap, "shadow");
  const motionDurationTokens = toTokenRows(sortNumericKeys(motionDurationMap), MOTION_NAMES, "motion.duration", false, "ms");
  const motionEasingTokens = toRankedTokenRows(motionEasingMap, "motion.easing", true);

  const colorPalette = buildColorTokens(
    textColorMap,
    backgroundColorMap,
    borderColorMap,
    focusColorMap
  );

  const variables = payload.cssVariables || [];
  const enrichedColorPalette = enrichWithVariables(colorPalette, variables);
  const enrichedTypographyScale = enrichWithVariables(typographyScale, variables);
  const enrichedSpacingScale = enrichWithVariables(spacingScale, variables);
  const enrichedRadiusTokens = enrichWithVariables(radiusTokens, variables);

  const semanticColorPalette = inferSemanticRoles(enrichedColorPalette);

  const siteProfile = inferSiteProfile(payload);

  const antiPatterns = detectAntiPatterns(payload, semanticColorPalette, typographyScale);

  const architecture = inferArchitecture(payload);
  const designRationale = generateDesignRationale(siteProfile, semanticColorPalette, typographyScale, architecture);

  const diagnostics = [];
  if (payload.sampledElements < 30) {
    diagnostics.push("Low sample size: fewer than 30 visible elements were extracted.");
  }
  if (colorPalette.length < 4) {
    diagnostics.push("Limited color diversity detected; color token inference confidence is low.");
  }
  if (typographyScale.length < 3) {
    diagnostics.push("Limited typography variety detected; size scale may need manual refinement.");
  }
  if (!mainFontStyle.familyStack) {
    diagnostics.push("Main font family could not be confidently extracted from computed styles.");
  }
  if (siteProfile.confidence === "low") {
    diagnostics.push("Audience and product surface inference confidence is low; verify generated brand context.");
  }

  return {
    source: payload.source,
    sampledAt: payload.sampledAt,
    sampledElements: payload.sampledElements,
    totalElements: payload.totalElements,
    structureSnippet: payload.structureSnippet || null,
    typographyScale: enrichedTypographyScale,
    mainFontStyle,
    colorPalette: semanticColorPalette,
    spacingScale: enrichedSpacingScale,
    radiusTokens: enrichedRadiusTokens,
    shadowTokens,
    motionDurationTokens,
    motionEasingTokens,
    componentHints: summarizeComponents(payload.components || []),
    siteProfile,
    antiPatterns,
    architecture,
    designRationale,
    diagnostics
  };
}

function inferArchitecture(payload) {
  const samples = payload.architectureSamples || [];
  if (samples.length === 0) return "Unknown";

  let bemCount = 0;
  let tailwindCount = 0;
  let utilityCount = 0;

  for (const cls of samples) {
    if (!cls) continue;
    if (cls.includes("__") || cls.includes("--")) bemCount++;
    if (cls.includes("tw-") || cls.split(" ").some(c => /^[a-z]+-[a-z0-9]+$/.test(c))) utilityCount++;
    if (cls.includes("p-") || cls.includes("m-") || cls.includes("flex") || cls.includes("grid")) tailwindCount++;
  }

  if (tailwindCount > bemCount && tailwindCount > 10) return "Tailwind/Utility-First";
  if (bemCount > tailwindCount && bemCount > 5) return "BEM (Block Element Modifier)";
  if (utilityCount > 10) return "Utility-Based";

  return "Semantic CSS / Mixed Architecture";
}

function generateDesignRationale(profile, colors, typography, architecture) {
  const surface = profile.productSurface || "web application";
  const audience = profile.audience || "users";
  
  let intent = `Designed as a ${surface} for ${audience}, `;
  
  const textColors = colors.filter(c => c.token.includes("text"));
  if (textColors.length > 3) {
    intent += "utilizing a multi-layered typographic hierarchy for high information density. ";
  } else {
    intent += "focusing on a clean and minimal typographic approach. ";
  }

  if (architecture.includes("Tailwind")) {
    intent += `The system leverages a ${architecture} approach for rapid, consistent styling. `;
  }

  const primaryColor = colors.find(c => c.semanticRole === "surface.primary")?.value || "the detected palette";
  intent += `The visual language is anchored by ${primaryColor}, emphasizing reliability and brand presence.`;

  return intent;
}

function detectAntiPatterns(payload, colors, typography) {
  const patterns = [];

  // 1. Check for small font sizes
  const smallFonts = typography.filter(t => {
    const size = parseFloat(t.value);
    return size > 0 && size < 12;
  });
  if (smallFonts.length > 0) {
    patterns.push(`Inaccessible font sizes detected: ${smallFonts.map(f => f.value).join(", ")}. Minimum recommended size is 12px.`);
  }

  // 2. Check for low contrast (basic heuristic)
  const textColors = colors.filter(c => c.token.includes("text"));
  const bgColors = colors.filter(c => c.token.includes("surface"));
  
  // Simple heuristic: If text color is very close to surface color (diff < 30 in hex or similar)
  // Since we don't have a full contrast ratio library here, we'll look for "gray on gray" patterns
  const grayPattern = /#(?:[89a-fA-F]{2}){3}/; // Light grays
  const lightText = textColors.filter(c => grayPattern.test(c.value) && c.usage > 10);
  if (lightText.length > 0) {
    patterns.push("Potential low-contrast text detected. High usage of light-gray text tokens may impact readability.");
  }

  // 3. Check for too many colors (Design Debt)
  if (colors.length > 15) {
    patterns.push(`High color complexity: ${colors.length} unique color tokens detected. This may indicate design system fragmentation.`);
  }

  return patterns;
}

function inferSemanticRoles(palette) {
  if (!palette || palette.length === 0) return palette;

  return palette.map((row) => {
    const token = row.token || "";
    const isBg = token.includes("background");
    const isText = token.includes("text");
    const isBorder = token.includes("border");

    let role = "";
    if (isBg) {
      if (row.usage > 50) role = "surface.primary";
      else if (row.usage > 20) role = "surface.secondary";
      else role = "surface.accent";
    } else if (isText) {
      if (row.usage > 50) role = "text.primary";
      else if (row.usage > 20) role = "text.secondary";
      else role = "text.muted";
    } else if (isBorder) {
      role = "border.default";
    }

    return { ...row, semanticRole: role, token: role ? `color.${role}` : row.token };
  });
}

function enrichWithVariables(rows, variables) {
  if (!variables || variables.length === 0) return rows;

  return rows.map((row) => {
    const match = variables.find((v) => v.value === row.value);
    if (match) {
      return { ...row, variable: match.name };
    }
    return row;
  });
}

function inferSiteProfile(payload) {
  const signals = payload.siteSignals || {};
  const counts = signals.elementCounts || {};
  const corpus = toCorpus(payload, signals);
  const evidence = [];

  const surfaceScores = {
    documentation: 0,
    dashboard: 0,
    marketing: 0,
    content: 0,
    ecommerce: 0,
    webapp: 0
  };

  surfaceScores.documentation += keywordScore(
    corpus,
    ["docs", "documentation", "api", "reference", "sdk", "cli", "guide", "tutorial", "endpoint", "quickstart"],
    0.8,
    evidence,
    "documentation"
  );
  surfaceScores.documentation += numericCue(counts.codeBlocks, 4, 0.35, evidence, "code blocks");
  surfaceScores.documentation += pathnameCue(signals.pathname, ["/docs", "/documentation", "/api"], 2, evidence, "documentation path");

  surfaceScores.dashboard += keywordScore(
    corpus,
    ["dashboard", "workspace", "settings", "analytics", "reports", "admin", "billing", "projects", "users", "team"],
    0.7,
    evidence,
    "dashboard"
  );
  surfaceScores.dashboard += numericCue(counts.forms, 3, 0.4, evidence, "forms");
  surfaceScores.dashboard += numericCue(counts.inputs, 8, 0.2, evidence, "inputs");
  surfaceScores.dashboard += numericCue(counts.tables, 1, 0.45, evidence, "tables");
  surfaceScores.dashboard += numericCue(counts.authMarkers, 2, 0.35, evidence, "auth markers");

  surfaceScores.marketing += keywordScore(
    corpus,
    ["features", "pricing", "contact sales", "book demo", "testimonials", "enterprise", "why", "benefits", "get started", "start free"],
    0.6,
    evidence,
    "marketing"
  );
  surfaceScores.marketing += numericCue(counts.pricingSections, 1, 1.4, evidence, "pricing sections");

  surfaceScores.content += keywordScore(
    corpus,
    ["blog", "article", "news", "read more", "newsletter", "editorial", "author", "published"],
    0.7,
    evidence,
    "content"
  );
  surfaceScores.content += numericCue(counts.articles, 2, 0.5, evidence, "article containers");

  surfaceScores.ecommerce += keywordScore(
    corpus,
    ["shop", "product", "checkout", "cart", "sku", "inventory", "buy now", "shipping", "order", "wishlist"],
    0.8,
    evidence,
    "e-commerce"
  );
  surfaceScores.ecommerce += numericCue(counts.productMarkers, 1, 1.1, evidence, "product markers");
  surfaceScores.ecommerce += numericCue(counts.checkoutMarkers, 1, 1.2, evidence, "checkout markers");

  surfaceScores.webapp += keywordScore(
    corpus,
    ["account", "profile", "workspace", "app", "platform", "notifications", "integrations"],
    0.35,
    evidence,
    "web app"
  );

  const bestSurface = pickTop(surfaceScores);
  const surfaceConfidence = confidenceFromScores(bestSurface);
  const productSurface = toProductSurfaceLabel(bestSurface.key);

  const audienceScores = {
    developer: 0,
    operator: 0,
    business: 0,
    consumer: 0,
    reader: 0,
    general: 0
  };

  audienceScores.developer += keywordScore(
    corpus,
    ["developer", "api", "sdk", "cli", "repository", "github", "code", "integration", "docs", "terminal"],
    0.75,
    evidence,
    "developer audience"
  );
  audienceScores.developer += numericCue(counts.codeBlocks, 3, 0.45, evidence, "developer code blocks");

  audienceScores.operator += keywordScore(
    corpus,
    ["dashboard", "workspace", "manage", "settings", "admin", "team", "reports", "billing", "monitor"],
    0.55,
    evidence,
    "operator audience"
  );
  audienceScores.operator += numericCue(counts.forms, 2, 0.35, evidence, "operator workflows");
  audienceScores.operator += numericCue(counts.tables, 1, 0.35, evidence, "operator data tables");

  audienceScores.business += keywordScore(
    corpus,
    ["enterprise", "teams", "pricing", "sales", "compliance", "roi", "case study", "customers", "business"],
    0.55,
    evidence,
    "business audience"
  );

  audienceScores.consumer += keywordScore(
    corpus,
    ["shop", "cart", "checkout", "buy", "shipping", "deal", "discount", "collection", "product"],
    0.65,
    evidence,
    "consumer audience"
  );
  audienceScores.consumer += numericCue(counts.productMarkers, 1, 0.6, evidence, "consumer product markers");

  audienceScores.reader += keywordScore(
    corpus,
    ["blog", "article", "newsletter", "guide", "news", "story", "read", "insights"],
    0.55,
    evidence,
    "reader audience"
  );
  audienceScores.reader += numericCue(counts.articles, 2, 0.4, evidence, "reader article containers");

  if (bestSurface.key === "documentation") {
    audienceScores.developer += 1.8;
  }
  if (bestSurface.key === "dashboard") {
    audienceScores.operator += 1.3;
  }
  if (bestSurface.key === "ecommerce") {
    audienceScores.consumer += 1.2;
  }
  if (bestSurface.key === "marketing") {
    audienceScores.business += 0.8;
  }
  if (bestSurface.key === "content") {
    audienceScores.reader += 0.8;
  }

  audienceScores.general += keywordScore(
    corpus,
    ["home", "welcome", "about", "contact"],
    0.2,
    evidence,
    "general audience"
  );

  const bestAudience = pickTop(audienceScores);
  const audience = toAudienceLabel(bestAudience.key, bestSurface.key);
  const audienceConfidence = confidenceFromScores(bestAudience);

  return {
    audience,
    productSurface,
    confidence: lowerConfidence(surfaceConfidence, audienceConfidence),
    scores: {
      surface: surfaceScores,
      audience: audienceScores
    },
    evidence: dedupeEvidence(evidence).slice(0, 8)
  };
}

function toCorpus(payload, signals) {
  const blocks = [
    payload.source?.url || "",
    payload.source?.title || "",
    signals.title || "",
    signals.description || "",
    signals.keywords || "",
    signals.ogType || "",
    signals.ogSiteName || "",
    signals.appName || "",
    signals.pathname || "",
    (signals.headings || []).join(" "),
    (signals.navTexts || []).join(" "),
    (signals.ctaTexts || []).join(" "),
    (signals.textSample || "").slice(0, 2400)
  ];
  return normalizeWhitespace(blocks.join(" ").toLowerCase());
}

function keywordScore(corpus, keywords, weight, evidence, label) {
  let hits = 0;
  for (const keyword of keywords) {
    if (corpus.includes(keyword)) {
      hits += 1;
    }
  }
  const score = hits * weight;
  if (hits > 0) {
    evidence.push(`${label}: ${hits} keyword hit${hits > 1 ? "s" : ""}`);
  }
  return score;
}

function numericCue(value, threshold, weight, evidence, label) {
  const numeric = Number(value || 0);
  if (numeric < threshold) {
    return 0;
  }
  const strength = Math.max(1, Math.floor(numeric / threshold));
  evidence.push(`${label}: ${numeric}`);
  return strength * weight;
}

function pathnameCue(pathname, fragments, score, evidence, label) {
  const path = String(pathname || "").toLowerCase();
  if (!path) {
    return 0;
  }
  for (const fragment of fragments) {
    if (path.includes(fragment)) {
      evidence.push(`${label}: ${fragment}`);
      return score;
    }
  }
  return 0;
}

function pickTop(scoreMap) {
  const rows = Object.entries(scoreMap).sort((a, b) => b[1] - a[1]);
  const [key, score] = rows[0] || ["webapp", 0];
  const next = rows[1]?.[1] ?? 0;
  return {
    key,
    score,
    next,
    gap: score - next
  };
}

function confidenceFromScores(result) {
  if (result.score >= 5 && result.gap >= 1.4) {
    return "high";
  }
  if (result.score >= 2.4 && result.gap >= 0.5) {
    return "medium";
  }
  return "low";
}

function lowerConfidence(a, b) {
  const ranks = { low: 0, medium: 1, high: 2 };
  return ranks[a] <= ranks[b] ? a : b;
}

function toProductSurfaceLabel(surfaceKey) {
  switch (surfaceKey) {
    case "documentation":
      return "documentation site";
    case "dashboard":
      return "dashboard web app";
    case "marketing":
      return "marketing site";
    case "content":
      return "content site";
    case "ecommerce":
      return "e-commerce storefront";
    default:
      return "web app";
  }
}

function toAudienceLabel(audienceKey, surfaceKey) {
  switch (audienceKey) {
    case "developer":
      return "developers and technical teams";
    case "operator":
      return "authenticated users and operators";
    case "business":
      return "buyers, teams, and decision-makers";
    case "consumer":
      return "online shoppers and consumers";
    case "reader":
      return "readers and knowledge seekers";
    default:
      return fallbackAudienceForSurface(surfaceKey);
  }
}

function fallbackAudienceForSurface(surfaceKey) {
  if (surfaceKey === "documentation") {
    return "developers and technical teams";
  }
  if (surfaceKey === "marketing") {
    return "prospective customers and evaluators";
  }
  if (surfaceKey === "dashboard") {
    return "authenticated users and operators";
  }
  if (surfaceKey === "ecommerce") {
    return "online shoppers and consumers";
  }
  if (surfaceKey === "content") {
    return "readers and subscribers";
  }
  return "website visitors and product users";
}

function dedupeEvidence(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function inferMainFontStyle(typographyRows, fontFamilyMap) {
  const topFamilyEntry = topEntries(fontFamilyMap, 1)[0];
  const familyStack = topFamilyEntry?.key || "";
  const primaryFamily = getPrimaryFontFamily(familyStack);
  const familyUsage = topFamilyEntry?.count || 0;

  if (!familyStack) {
    return {
      familyStack: "",
      primaryFamily: "",
      weight: "",
      size: "",
      lineHeight: "",
      usage: 0,
      confidence: "low"
    };
  }

  const styleMap = new Map();
  for (const row of typographyRows || []) {
    const normalizedFamily = normalizeFontFamilyStack(row.fontFamily);
    if (!normalizedFamily || normalizedFamily !== familyStack) {
      continue;
    }
    const style = snapshotFontStyle(row);
    const key = JSON.stringify(style);
    increment(styleMap, key);
  }

  const topStyleEntry = topEntries(styleMap, 1)[0];
  const style = topStyleEntry ? JSON.parse(topStyleEntry.key) : {};
  const styleUsage = topStyleEntry?.count || 0;
  const confidence = inferFontConfidence(familyUsage, styleUsage, typographyRows.length);

  return {
    familyStack,
    primaryFamily,
    weight: style.weight || "",
    size: style.size || "",
    lineHeight: style.lineHeight || "",
    usage: familyUsage,
    confidence
  };
}

function snapshotFontStyle(row) {
  return {
    weight: normalizeWhitespace(row.fontWeight || ""),
    size: normalizeWhitespace(row.fontSize || ""),
    lineHeight: normalizeWhitespace(row.lineHeight || "")
  };
}

function normalizeFontFamilyStack(value) {
  const raw = normalizeWhitespace(value || "");
  if (!raw) {
    return "";
  }

  const parts = raw
    .split(",")
    .map((item) => item.trim())
    .map((item) => item.replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);

  if (parts.length === 0) {
    return "";
  }
  return parts.join(", ");
}

function getPrimaryFontFamily(stack) {
  const first = String(stack || "").split(",")[0]?.trim() || "";
  return first.replace(/^['"]|['"]$/g, "");
}

function inferFontConfidence(familyUsage, styleUsage, totalRows) {
  const ratio = totalRows > 0 ? familyUsage / totalRows : 0;
  if (ratio >= 0.45 && styleUsage >= 3) {
    return "high";
  }
  if (ratio >= 0.2 && styleUsage >= 1) {
    return "medium";
  }
  return "low";
}

function summarizeComponents(components) {
  return components
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 7);
}

function buildColorTokens(textMap, bgMap, borderMap, focusMap) {
  const rows = [];

  const textRows = topEntries(textMap, 4);
  textRows.forEach((entry, index) => {
    rows.push({
      token: `color.text.${TEXT_NAMES[index] || `level${index + 1}`}`,
      value: entry.key,
      usage: entry.count
    });
  });

  const bgRows = topEntries(bgMap, 4);
  bgRows.forEach((entry, index) => {
    rows.push({
      token: `color.surface.${SURFACE_NAMES[index] || `level${index + 1}`}`,
      value: entry.key,
      usage: entry.count
    });
  });

  const borderRows = topEntries(borderMap, 3);
  borderRows.forEach((entry, index) => {
    rows.push({
      token: `color.border.${BORDER_NAMES[index] || `level${index + 1}`}`,
      value: entry.key,
      usage: entry.count
    });
  });

  const focusRow = topEntries(focusMap, 1)[0];
  if (focusRow) {
    rows.push({
      token: "color.focus.ring",
      value: focusRow.key,
      usage: focusRow.count
    });
  }

  return dedupeByValue(rows);
}

function dedupeByValue(rows) {
  const byValue = new Map();
  for (const row of rows) {
    const existing = byValue.get(row.value);
    if (!existing || row.usage > existing.usage) {
      byValue.set(row.value, row);
    }
  }
  return Array.from(byValue.values());
}

function topEntries(map, limit) {
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function toTokenRows(values, names, prefix, useNumericSequence = false, unit = "px") {
  return values.map((value, index) => ({
    token: `${prefix}.${useNumericSequence ? index + 1 : names[index] || `step${index + 1}`}`,
    value: `${value}${unit}`,
    usage: 0
  }));
}

function toRankedTokenRows(map, prefix, keepRawValue = false) {
  return topEntries(map, 4).map((entry, index) => ({
    token: `${prefix}.${index + 1}`,
    value: keepRawValue ? entry.key : normalizeWhitespace(entry.key),
    usage: entry.count
  }));
}

function sortNumericKeys(map) {
  return Array.from(map.keys())
    .map((key) => Number.parseFloat(key))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
}

function increment(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function parsePx(value) {
  if (!value || value === "normal" || value === "auto") {
    return null;
  }
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return round(parsed, 2);
}

function parseDuration(value) {
  if (!value) {
    return null;
  }
  const first = String(value).split(",")[0].trim();
  if (!first) {
    return null;
  }
  if (first.endsWith("ms")) {
    const parsed = Number.parseFloat(first);
    return Number.isFinite(parsed) ? round(parsed, 1) : null;
  }
  if (first.endsWith("s")) {
    const parsed = Number.parseFloat(first);
    return Number.isFinite(parsed) ? round(parsed * 1000, 1) : null;
  }
  return null;
}

function toCanonicalColor(value) {
  if (!value) {
    return null;
  }
  const raw = normalizeWhitespace(String(value).toLowerCase());
  if (!raw) {
    return null;
  }
  if (raw.startsWith("#")) {
    return raw;
  }
  const rgb = parseRgbLike(raw);
  if (!rgb) {
    return raw;
  }
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

function parseRgbLike(value) {
  const match = value.match(/^rgba?\(([^)]+)\)$/);
  if (!match) {
    return null;
  }
  const [r, g, b] = match[1]
    .split(",")
    .slice(0, 3)
    .map((part) => Number.parseFloat(part.trim()));
  if (![r, g, b].every((part) => Number.isFinite(part))) {
    return null;
  }
  return {
    r: clampByte(r),
    g: clampByte(g),
    b: clampByte(b)
  };
}

function rgbToHex(r, g, b) {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function toHex(value) {
  return value.toString(16).padStart(2, "0");
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function isTransparent(value) {
  return value.includes("transparent");
}

function normalizeWhitespace(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function round(value, precision) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}
