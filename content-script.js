(function installExtractor() {
  const MESSAGE_TYPE = "TYPEUI_EXTRACT_STYLES";

  if (window.__typeuiStyleExtractorInstalled) {
    return;
  }

  window.__typeuiStyleExtractorInstalled = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.type) {
      return;
    }

    if (message.type === MESSAGE_TYPE) {
      try {
        const payload = extractStylesFromPage();
        sendResponse({ ok: true, payload });
      } catch (error) {
        const text = error instanceof Error ? error.message : "Unknown extraction error";
        sendResponse({ ok: false, error: text });
      }
    } else if (message.type === "TYPEUI_START_INSPECT") {
      startInspection();
      sendResponse({ ok: true });
    }
  });

  let inspectOverlay = null;
  let lastInspectedElement = null;

  function startInspection() {
    if (inspectOverlay) return;

    inspectOverlay = document.createElement("div");
    Object.assign(inspectOverlay.style, {
      position: "fixed",
      pointerEvents: "none",
      zIndex: "2147483647",
      border: "2px solid #3b82f6",
      background: "rgba(59, 130, 246, 0.1)",
      transition: "all 0.1s ease",
      borderRadius: "4px"
    });
    document.documentElement.appendChild(inspectOverlay);

    const onMouseMove = (e) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (el && el !== inspectOverlay && el !== document.documentElement && el !== document.body) {
        lastInspectedElement = el;
        const rect = el.getBoundingClientRect();
        Object.assign(inspectOverlay.style, {
          top: `${rect.top}px`,
          left: `${rect.left}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
          display: "block"
        });
      }
    };

    const onClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      stopInspection();
      
      if (lastInspectedElement) {
        try {
          const payload = extractStylesFromPage(lastInspectedElement);
          chrome.runtime.sendMessage({ type: "TYPEUI_INSPECT_RESULT", ok: true, payload });
        } catch (error) {
          chrome.runtime.sendMessage({ type: "TYPEUI_INSPECT_RESULT", ok: false, error: error.message });
        }
      }
    };

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        stopInspection();
      }
    };

    function stopInspection() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown);
      if (inspectOverlay) {
        inspectOverlay.remove();
        inspectOverlay = null;
      }
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown);
  }

  function extractStylesFromPage(rootElement = null) {
    const sampledElements = collectSampledElements(280, rootElement);
    const typography = [];
    const colors = [];
    const spacing = [];
    const radius = [];
    const shadows = [];
    const motion = [];

    for (const el of sampledElements) {
      const style = window.getComputedStyle(el);
      typography.push({
        fontFamily: normalizeWhitespace(style.fontFamily),
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        fontWeight: style.fontWeight,
        letterSpacing: style.letterSpacing
      });

      colors.push({
        textColor: style.color,
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        outlineColor: style.outlineColor
      });

      spacing.push({
        marginTop: style.marginTop,
        marginRight: style.marginRight,
        marginBottom: style.marginBottom,
        marginLeft: style.marginLeft,
        paddingTop: style.paddingTop,
        paddingRight: style.paddingRight,
        paddingBottom: style.paddingBottom,
        paddingLeft: style.paddingLeft
      });

      radius.push(style.borderRadius);
      shadows.push(style.boxShadow);
      motion.push({
        transitionDuration: style.transitionDuration,
        transitionTimingFunction: style.transitionTimingFunction,
        animationDuration: style.animationDuration,
        animationTimingFunction: style.animationTimingFunction
      });
    }

    return {
      source: {
        url: window.location.href,
        title: document.title || "Untitled page"
      },
      sampledAt: new Date().toISOString(),
      totalElements: document.querySelectorAll("*").length,
      sampledElements: sampledElements.length,
      structureSnippet: rootElement ? rootElement.outerHTML.slice(0, 5000) : null,
      typography,
      colors,
      spacing,
      radius,
      shadows,
      motion,
      cssVariables: collectCssVariables(),
      components: collectComponentCounts(),
      siteSignals: collectSiteSignals(),
      architectureSamples: collectArchitectureSamples()
    };
  }

  function collectArchitectureSamples() {
    const elements = document.querySelectorAll("[class]");
    const classes = [];
    for (let i = 0; i < Math.min(elements.length, 100); i++) {
      classes.push(elements[i].getAttribute("class"));
    }
    return classes;
  }

  function collectCssVariables() {
    const variables = new Map();
    const roots = [document.documentElement, document.body];

    // Weakness 3: Include iframes in variable collection
    try {
      const iframes = document.querySelectorAll("iframe");
      for (const iframe of iframes) {
        try {
          if (iframe.contentDocument) {
            roots.push(iframe.contentDocument.documentElement, iframe.contentDocument.body);
          }
        } catch (e) {}
      }
    } catch (e) {}

    for (const el of roots) {
      if (!el) continue;
      try {
        const styles = window.getComputedStyle(el);
        for (let i = 0; i < styles.length; i++) {
          const prop = styles[i];
          if (prop.startsWith("--")) {
            const val = styles.getPropertyValue(prop).trim();
            if (val) variables.set(prop, val);
          }
        }
      } catch (e) {}
    }

    // Weakness 2: Improved CSS Variable extraction with fallback for CORS
    try {
      const documents = [document, ...Array.from(document.querySelectorAll("iframe")).map(f => {
        try { return f.contentDocument; } catch (e) { return null; }
      }).filter(d => d)];

      for (const doc of documents) {
        for (const sheet of doc.styleSheets) {
          try {
            const rules = sheet.cssRules || sheet.rules;
            if (!rules) continue;
            for (const rule of rules) {
              if (rule instanceof CSSStyleRule && rule.style) {
                for (let i = 0; i < rule.style.length; i++) {
                  const prop = rule.style[i];
                  if (prop.startsWith("--")) {
                    const val = rule.style.getPropertyValue(prop).trim();
                    if (val) variables.set(prop, val);
                  }
                }
              }
            }
          } catch (e) {
            // Weakness 2 fallback: If CORS blocks reading rules, we can't do much without a background fetch
            // but we can at least capture common variables from the computed style of the body
          }
        }
      }
    } catch (e) {}

    return Array.from(variables.entries()).map(([name, value]) => ({ name, value }));
  }

  function collectSampledElements(limit, rootElement = null) {
    const selectors = [
      "body",
      "h1,h2,h3,h4,h5,h6",
      "p",
      "a",
      "button",
      "input,textarea,select",
      "label",
      "nav,header,footer,main,section,article,aside",
      "ul li,ol li",
      "table,th,td",
      "[role='button']",
      "[class*='card']",
      "[class*='btn']",
      "[tabindex]"
    ];

    const seen = new Set();
    const output = [];
    const roots = [rootElement || document];

    // Weakness 3: Attempt to include same-origin iframes
    try {
      const iframes = document.querySelectorAll("iframe");
      for (const iframe of iframes) {
        try {
          if (iframe.contentDocument) {
            roots.push(iframe.contentDocument);
          }
        } catch (e) {
          // Cross-origin iframe, ignore
        }
      }
    } catch (e) {
      // Ignore
    }

    // If we have a root element, always include it as the first sample
    if (rootElement instanceof HTMLElement) {
      seen.add(rootElement);
      output.push(rootElement);
    }

    for (const root of roots) {
      for (const selector of selectors) {
        const nodes = root.querySelectorAll(selector);
        for (const node of nodes) {
          if (!(node instanceof HTMLElement)) {
            continue;
          }
          if (seen.has(node)) {
            continue;
          }
          if (!isVisible(node)) {
            continue;
          }
          seen.add(node);
          output.push(node);
          if (output.length >= limit) {
            return output;
          }
        }
      }
    }

    if (output.length === 0 && document.body) {
      output.push(document.body);
    }

    return output;
  }

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    return true;
  }

  function collectComponentCounts() {
    const map = {
      buttons: "button, [role='button'], .btn, [class*='button']",
      links: "a[href]",
      inputs: "input, textarea, select",
      cards: ".card, [class*='card'], article",
      navigation: "nav, header, [role='navigation']",
      modals: "[role='dialog'], [class*='modal'], [class*='dialog']",
      accordions: "details, [class*='accordion'], [class*='collapse']",
      tabs: "[role='tablist'], [class*='tabs-container'], .tabs",
      lists: "ul, ol",
      tables: "table",
      tooltips: "[role='tooltip'], [class*='tooltip']",
      badges: "[class*='badge'], [class*='tag']"
    };

    return Object.entries(map).map(([type, selector]) => ({
      type,
      count: document.querySelectorAll(selector).length
    }));
  }

  function collectSiteSignals() {
    const title = document.title || "";
    const description = getMetaContent("description");
    const keywords = getMetaContent("keywords");
    const ogType = getMetaContent("og:type", true);
    const ogSiteName = getMetaContent("og:site_name", true);
    const appName = getMetaContent("application-name");

    const framework = detectFramework(document.documentElement.outerHTML.slice(0, 10000));

    const headings = collectTexts("h1, h2", 10, 120);
    const navTexts = collectTexts("nav a, nav button, header a, header button", 24, 50);
    const ctaTexts = collectTexts(
      "button, [role='button'], a[class*='button'], a[class*='btn'], input[type='submit']",
      24,
      40
    );

    const bodyText = normalizeWhitespace((document.body?.innerText || "").slice(0, 10000));

    return {
      title,
      description,
      keywords,
      ogType,
      ogSiteName,
      appName,
      framework,
      pathname: window.location.pathname || "/",
      hostname: window.location.hostname || "",
      headings,
      navTexts,
      ctaTexts,
      textSample: bodyText,
      elementCounts: {
        forms: document.querySelectorAll("form").length,
        inputs: document.querySelectorAll("input, textarea, select").length,
        tables: document.querySelectorAll("table").length,
        codeBlocks: document.querySelectorAll("pre, code").length,
        articles: document.querySelectorAll("article").length,
        pricingSections: countNodesByText("section, div, article", ["pricing", "plans"], 500),
        productMarkers: document.querySelectorAll(
          "[itemtype*='Product'], [class*='product'], [id*='product'], [data-product]"
        ).length,
        authMarkers: countNodesByText("a, button, label, span", [
          "sign in",
          "log in",
          "login",
          "register",
          "dashboard",
          "workspace"
        ], 500),
        checkoutMarkers: countNodesByText("a, button, span", [
          "add to cart",
          "checkout",
          "buy now",
          "cart"
        ], 500)
      }
    };
  }

  function detectFramework(snippet) {
    const lowSnippet = snippet.toLowerCase();

    if (lowSnippet.includes("tailwind") || document.querySelector("[class*='tw-'], [class^='tw-'], [class*=':tw-']")) {
      return "Tailwind CSS";
    }
    if (lowSnippet.includes("bootstrap") || document.querySelector("[class*='btn-primary'], [class*='col-md-'], [class*='container-fluid']")) {
      return "Bootstrap";
    }
    if (lowSnippet.includes("mui") || document.querySelector("[class*='Mui']")) {
      return "Material UI";
    }
    if (lowSnippet.includes("chakra-ui") || document.querySelector("[class*='chakra-']")) {
      return "Chakra UI";
    }
    if (lowSnippet.includes("ant-design") || document.querySelector("[class*='ant-']")) {
      return "Ant Design";
    }
    if (lowSnippet.includes("styled-components") || document.querySelector("[class*='sc-']")) {
      return "Styled Components";
    }
    return "Unknown";
  }

  function getMetaContent(name, property = false) {
    const selector = property ? `meta[property="${name}"]` : `meta[name="${name}"]`;
    const value = document.querySelector(selector)?.getAttribute("content");
    return normalizeWhitespace(value || "");
  }

  function collectTexts(selector, limit, maxLength) {
    const seen = new Set();
    const output = [];
    const nodes = document.querySelectorAll(selector);
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }
      const text = normalizeWhitespace(node.innerText || node.textContent || "");
      if (!text || text.length > maxLength) {
        continue;
      }
      if (seen.has(text)) {
        continue;
      }
      seen.add(text);
      output.push(text);
      if (output.length >= limit) {
        break;
      }
    }
    return output;
  }

  function countNodesByText(selector, keywords, nodeLimit = 1000) {
    const nodes = document.querySelectorAll(selector);
    let count = 0;
    let checked = 0;
    for (const node of nodes) {
      if (checked >= nodeLimit) break;
      checked++;
      if (!(node instanceof HTMLElement)) {
        continue;
      }
      const text = normalizeWhitespace((node.innerText || node.textContent || "").toLowerCase());
      if (!text) {
        continue;
      }
      if (keywords.some((keyword) => text.includes(keyword))) {
        count += 1;
      }
    }
    return count;
  }

  function normalizeWhitespace(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ");
  }
})();
