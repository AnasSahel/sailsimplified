/**
 * Shared step walker — used by every rule that needs to inspect nested
 * transform steps (broken-reference, lookup-missing-default, …).
 *
 * Why shared: SailPoint encodes nested transforms inside `attributes` as
 * objects with a string `type` field (e.g. `firstValid.values` is an
 * array of step objects, each with its own `type` and `attributes`). Any
 * rule that wants to flag a property on a *kind* of step has to walk the
 * tree the same way — duplicating the walker per rule was the original
 * shape but moved out as soon as the second rule needed it
 * (`lookup-missing-default` in PR #3 of #310).
 */

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Walk every nested step in `node` and call `visit` on each one. A
 * "step" is any object with a string `type` field.
 *
 * `path` is the JSON-pointer-style path from the transform root, used
 * for the issue's `pointer` field — e.g. `/attributes/values/2`.
 */
export function walkSteps(
  node: unknown,
  path: string,
  visit: (step: Record<string, unknown>, path: string) => void,
): void {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      walkSteps(node[i], `${path}/${i}`, visit);
    }
    return;
  }
  if (!isRecord(node)) return;

  if (typeof node.type === "string") {
    visit(node, path);
  }

  for (const [key, value] of Object.entries(node)) {
    // Skip `type` itself — it's a primitive, not a sub-step.
    if (key === "type") continue;
    walkSteps(value, `${path}/${key}`, visit);
  }
}
