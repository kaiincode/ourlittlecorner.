// Helpers for rendering/storing rich text in `content` fields.
// We store editor content as a small subset of HTML (b/i/u/br/p/div/li...).
// This keeps "bold/italic" formatting when re-opening and re-saving.

export function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function isLikelyHtml(input: string): boolean {
  // Detect actual tags OR common HTML entities emitted by `contentEditable` (notably `&nbsp;`).
  // If we don't detect `&nbsp;`, we might treat it as plain text and escape it into `&amp;nbsp;`.
  return (
    /<\/?[a-z][\s\S]*>/i.test(input) ||
    /&(?:nbsp|amp|quot|lt|gt);/i.test(input) ||
    /&#\d+;/.test(input) ||
    /&#x[0-9a-f]+;/i.test(input)
  );
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    // Handle double-escaped entities like `&amp;nbsp;`.
    .replace(/&amp;nbsp;/gi, "&nbsp;")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function plainTextToHtml(text: string): string {
  // Preserve newlines from the contentEditable box.
  return escapeHtml(text).replace(/\n/g, "<br />");
}

export function sanitizeRichTextHtml(input: string): string {
  // If we're somehow executed on server, fall back to safe escaping.
  if (typeof DOMParser === "undefined" || typeof NodeFilter === "undefined") {
    // If it's "HTML-looking", strip tags then escape to avoid injection.
    if (isLikelyHtml(input)) return escapeHtml(stripHtml(input)).replaceAll("\n", "<br />");
    return plainTextToHtml(input);
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(input, "text/html");
  const body = doc.body;

  const ALLOWED_FONT_FAMILIES_NORMALIZED = new Set(
    [
      "inter,sans-serif",
      "var(--font-inter),inter,sans-serif",
      "var(--font-handwriting),cursive",
      "mynerve,cursive",
      "playfairdisplay,serif",
      "montserrat,sans-serif",
      "satisfy,cursive",
      "pacifico,cursive",
      "jetbrainsmono,monospace",
    ].map((s) => s.toLowerCase().replace(/\s+/g, "").replace(/['"]/g, ""))
  );

  const normalizeFontFamily = (value: string) =>
    value.toLowerCase().replace(/\s+/g, "").replace(/['"]/g, "");

  const isAllowedFontFamily = (raw: string) =>
    ALLOWED_FONT_FAMILIES_NORMALIZED.has(normalizeFontFamily(raw));

  // `execCommand('fontName')` may wrap with <font face="...">.
  // Map the `face` value to an allowed CSS font-family string.
  const FONT_FACE_TO_CSS: Record<string, string> = {
    inter: "var(--font-inter), 'Inter', sans-serif",
    handwriting: "var(--font-handwriting), cursive",
    mynerve: "var(--font-handwriting), cursive",
    "playfair display": "'Playfair Display', serif",
    montserrat: "'Montserrat', sans-serif",
    satisfy: "'Satisfy', cursive",
    pacifico: "'Pacifico', cursive",
    "jetbrains mono": "'JetBrains Mono', monospace",
  };

  const normalizeFontFace = (value: string) =>
    value.toLowerCase().replace(/\s+/g, " ").trim();

  const allowedTags = new Set([
    "B",
    "STRONG",
    "I",
    "EM",
    "U",
    "BR",
    "P",
    "DIV",
    "UL",
    "OL",
    "LI",
    "BLOCKQUOTE",
    "CODE",
    "SPAN",
    "FONT",
  ]);

  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_ELEMENT);
  const nodes: Element[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Element);

  for (const el of nodes) {
    const tag = el.tagName.toUpperCase();

    // Some browsers wrap `fontName` command with <font face="...">.
    // Convert it to a safe <span style="font-family:...">.
    if (tag === "FONT") {
      const face = (el.getAttribute("face") || "").trim();
      const mapped = FONT_FACE_TO_CSS[normalizeFontFace(face)];
      if (!mapped) {
        const text = el.textContent ?? "";
        el.replaceWith(doc.createTextNode(text));
        continue;
      }

      const span = doc.createElement("SPAN");
      span.style.fontFamily = mapped;
      while (el.firstChild) span.appendChild(el.firstChild);
      el.replaceWith(span);
      continue;
    }

    if (!allowedTags.has(tag)) {
      // Replace disallowed elements with their text content.
      const text = el.textContent ?? "";
      el.replaceWith(doc.createTextNode(text));
      continue;
    }

    // Remove all attributes to keep it safe/minimal.
    // However, some browsers wrap formatting with <span style="..."> instead of <b>/<i>/<u>,
    // so we allow a tiny safe subset of style properties.
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.toLowerCase() !== "style") {
        el.removeAttribute(attr.name);
        continue;
      }

      const rawStyle = attr.value || "";
      const safeParts = rawStyle
        .split(";")
        .map((p) => p.trim())
        .filter(Boolean)
        .filter((p) => {
          const normalized = p.toLowerCase();
          // Keep only a very small set of formatting-related properties.
          if (
            /url\s*\(|expression\s*\(|javascript\s*:/i.test(normalized) ||
            normalized.includes("@import")
          ) {
            return false;
          }

          if (
            normalized.startsWith("font-family:") &&
            isAllowedFontFamily(normalized.replace("font-family:", "").trim())
          ) {
            return true;
          }

          return (
            normalized.startsWith("font-weight:") ||
            normalized.startsWith("font-style:") ||
            normalized.startsWith("text-decoration:") ||
            normalized.startsWith("text-decoration-line:")
          );
        })
        .map((p) => p.replace(/\s+/g, " "))
        .slice(0, 6);

      const safeStyle = safeParts.join("; ");
      if (safeStyle) el.setAttribute("style", safeStyle);
      else el.removeAttribute("style");
    }
  }

  return body.innerHTML;
}

function decodeHtmlEntitiesDeep(input: string, maxIterations = 6): string {
  if (typeof DOMParser === "undefined") return input;
  let s = input;

  for (let i = 0; i < maxIterations; i++) {
    if (!s.includes("&amp;")) break;
    // If it contains tags, entity-decoding alone might be unsafe; leave to sanitizer.
    if (s.includes("<")) break;

    const parser = new DOMParser();
    const doc = parser.parseFromString(s, "text/html");
    const next = doc.body.textContent ?? "";
    if (next === s) break;
    s = next;
  }

  return s;
}

export function htmlToEditorHtml(input: string | null | undefined): string {
  if (!input) return "";
  const str = input;
  if (!isLikelyHtml(str)) return plainTextToHtml(str);

  // Normalize double/triple-escaped entity-only strings like `&amp;amp;nbsp;`.
  if (!str.includes("<") && str.includes("&amp;")) {
    return plainTextToHtml(decodeHtmlEntitiesDeep(str));
  }

  return sanitizeRichTextHtml(str);
}

export function htmlToDisplayHtml(input: string | null | undefined): string {
  if (!input) return "";
  const str = input;
  if (!isLikelyHtml(str)) return plainTextToHtml(str);

  if (!str.includes("<") && str.includes("&amp;")) {
    return plainTextToHtml(decodeHtmlEntitiesDeep(str));
  }

  return sanitizeRichTextHtml(str);
}

export function contentHasFontStyling(input: string | null | undefined): boolean {
  if (!input) return false;
  // Detect inline font styling or old <font face="..."> markup.
  return /font-family\s*:|<font\b|face\s*=/i.test(input);
}

