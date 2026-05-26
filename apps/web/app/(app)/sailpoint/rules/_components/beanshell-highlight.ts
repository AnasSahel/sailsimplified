/**
 * Escape-safe BeanShell / Java syntax highlighter — shared by the
 * editable `RuleCodeEditor` (authoring, #352) and the shared `CodeViewer`
 * (#414) for read-only displays. Tokenizes in one pass so a keyword
 * inside a string or comment is never re-highlighted. Token order
 * matters: comments and strings are matched before identifiers. Colours
 * are tuned for a dark `bg-neutral-900` block, same palette family as
 * `highlightJson`.
 */

const JAVA_KEYWORDS = new Set([
  "abstract", "boolean", "break", "byte", "case", "catch", "char", "class",
  "const", "continue", "default", "do", "double", "else", "enum", "extends",
  "final", "finally", "float", "for", "goto", "if", "implements", "import",
  "instanceof", "int", "interface", "long", "native", "new", "null", "package",
  "private", "protected", "public", "return", "short", "static", "strictfp",
  "super", "switch", "synchronized", "this", "throw", "throws", "transient",
  "try", "void", "volatile", "while", "true", "false",
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
      out += `<span style="color:#86efac">${escapeHtml(str)}</span>`;
    } else if (num !== undefined) {
      out += `<span style="color:#fbbf24">${escapeHtml(num)}</span>`;
    } else if (ident !== undefined) {
      if (JAVA_KEYWORDS.has(ident)) {
        out += `<span style="color:#93c5fd">${escapeHtml(ident)}</span>`;
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
