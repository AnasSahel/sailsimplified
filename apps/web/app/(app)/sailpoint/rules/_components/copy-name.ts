/**
 * Find the first non-colliding name in the `<base> (copy[ N])` family.
 *
 * Pure function — kept out of the `"use server"` module because Next.js
 * requires every export from a server-action file to be an async function.
 * Mirror of the transforms helper; duplicated rather than cross-imported
 * to keep the rules surface self-contained.
 */
export function findAvailableCopyName(
  base: string,
  existing: ReadonlySet<string>,
): string | null {
  const stripped = base.replace(/\s\(copy(?:\s\d+)?\)\s*$/, "");
  const first = `${stripped} (copy)`;
  if (!existing.has(first)) return first;
  for (let i = 2; i <= 999; i++) {
    const candidate = `${stripped} (copy ${i})`;
    if (!existing.has(candidate)) return candidate;
  }
  return null;
}
