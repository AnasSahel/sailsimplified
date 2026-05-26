/**
 * JSON syntax highlighter (no React) — extracted so both `CodeViewer`
 * (#414) and the legacy `JsonView` re-export can import it without forming
 * a circular dependency.
 *
 * Tuned for a dark `bg-neutral-900` surface — all callers render on a
 * dark panel.
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
        return `<span class="text-sky-300">${keyStr}</span>${keyColon}`;
      }
      if (strVal) {
        return `<span class="text-emerald-300">${strVal}</span>`;
      }
      if (boolVal) {
        return `<span class="text-amber-300">${boolVal}</span>`;
      }
      if (nullVal) {
        return `<span class="text-neutral-500">${nullVal}</span>`;
      }
      if (numVal) {
        return `<span class="text-rose-300">${numVal}</span>`;
      }
      return "";
    },
  );
}
