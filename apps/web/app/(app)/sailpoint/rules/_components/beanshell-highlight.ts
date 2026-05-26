/**
 * Escape-safe BeanShell / Java syntax highlighter — shared by the
 * editable `RuleCodeEditor` (#352) and the shared `CodeViewer` (#414) /
 * `CodeFrame` (#419) for read-only and editable displays. Tokenizes in
 * one pass so a keyword inside a string or comment is never re-highlighted.
 * Token order matters: comments and strings are matched before identifiers.
 *
 * Palette: Tokyo Night-inspired (#421) — types in coral, control / modifier
 * keywords in blue, strings in green. Tuned for the dark `#0d1117` body
 * surface set by `CodeFrame`.
 */

// Primitive types + void — coloured as types (coral), not control keywords.
const JAVA_TYPES = new Set([
  "boolean", "byte", "char", "double", "float", "int", "long", "short", "void",
]);

// Control flow + modifiers + class-related + literals — coloured blue.
const JAVA_KEYWORDS = new Set([
  // control flow
  "break", "case", "catch", "continue", "default", "do", "else", "finally",
  "for", "goto", "if", "return", "switch", "throw", "throws", "try", "while",
  // class / module
  "class", "const", "enum", "extends", "implements", "import", "instanceof",
  "interface", "new", "package", "super", "this",
  // modifiers
  "abstract", "final", "native", "private", "protected", "public", "static",
  "strictfp", "synchronized", "transient", "volatile",
  // literals
  "false", "null", "true",
]);

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function highlightBeanShell(src: string): string {
  // Single regex with alternation; each branch is a named capture class.
  const token =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\b\d[\d._]*\b)|([A-Za-z_$][\w$]*)/g;

  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = token.exec(src)) !== null) {
    // Emit any plain text between the previous match and this one.
    if (m.index > last) out += escapeHtml(src.slice(last, m.index));
    const [whole, comment, str, num, ident] = m;
    if (comment !== undefined) {
      out += `<span style="color:#6b7280">${escapeHtml(comment)}</span>`;
    } else if (str !== undefined) {
      out += `<span style="color:#9ece6a">${escapeHtml(str)}</span>`;
    } else if (num !== undefined) {
      out += `<span style="color:#ff9e64">${escapeHtml(num)}</span>`;
    } else if (ident !== undefined) {
      if (JAVA_TYPES.has(ident)) {
        // Primitive types: coral
        out += `<span style="color:#f7768e">${escapeHtml(ident)}</span>`;
      } else if (JAVA_KEYWORDS.has(ident)) {
        // Control / modifier keywords: blue
        out += `<span style="color:#7aa2f7">${escapeHtml(ident)}</span>`;
      } else if (/^[A-Z]/.test(ident)) {
        // Capitalized identifier — class/type by convention (List, JSONObject,
        // ArrayList, Map, HashMap, …). Coloured as a type.
        out += `<span style="color:#f7768e">${escapeHtml(ident)}</span>`;
      } else {
        out += escapeHtml(ident);
      }
    } else {
      out += escapeHtml(whole);
    }
    last = token.lastIndex;
  }
  if (last < src.length) out += escapeHtml(src.slice(last));
  return out;
}
