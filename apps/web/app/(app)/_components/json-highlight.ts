/**
 * JSON syntax highlighter (no React) — extracted so both `CodeViewer`
 * (#414) and the legacy `JsonView` re-export can import it without forming
 * a circular dependency.
 *
 * Palette: Tokyo Night-inspired (#421), aligned with `highlightBeanShell`.
 * Keys → blue, strings → green, numbers/booleans → coral, null → muted.
 * Tuned for the dark `#0d1117` body surface set by `CodeFrame`.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Token classes (Tailwind). Priority order matters: keys first (matched
// as `"..."` followed by `:`), then string values, then booleans / null /
// numbers.
const TOKEN_RE =
  /(&quot;(?:[^&\\]|\\.)*?&quot;)(\s*:)|(&quot;(?:[^&\\]|\\.)*?&quot;)|\b(true|false)\b|\b(null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

export function highlightJson(json: string): string {
  const escaped = escapeHtml(json);
  return escaped.replace(
    TOKEN_RE,
    (_match, keyStr, keyColon, strVal, boolVal, nullVal, numVal) => {
      if (keyStr && keyColon) {
        return `<span style="color:#7aa2f7">${keyStr}</span>${keyColon}`;
      }
      if (strVal) {
        return `<span style="color:#9ece6a">${strVal}</span>`;
      }
      if (boolVal) {
        return `<span style="color:#ff9e64">${boolVal}</span>`;
      }
      if (nullVal) {
        return `<span style="color:#6b7280">${nullVal}</span>`;
      }
      if (numVal) {
        return `<span style="color:#ff9e64">${numVal}</span>`;
      }
      return "";
    },
  );
}
