import { CodeViewer } from "./code-viewer";

// Re-exported so existing imports `from "../../../_components/json-view"`
// keep working. The actual highlighter lives in `./json-highlight` to break
// the `CodeViewer` ↔ `JsonView` import cycle (#414).
export { highlightJson } from "./json-highlight";

/**
 * Render an arbitrary JS value as pretty-printed, syntax-highlighted JSON
 * inside the shared `CodeViewer` chrome (#414). Thin wrapper that does the
 * `JSON.stringify` step callers used to do themselves.
 */
export function JsonView({
  data,
  filename,
  className,
}: {
  data: unknown;
  filename?: string;
  className?: string;
}) {
  const json = JSON.stringify(data, null, 2);
  return (
    <CodeViewer
      value={json}
      language="json"
      filename={filename}
      className={className}
    />
  );
}
