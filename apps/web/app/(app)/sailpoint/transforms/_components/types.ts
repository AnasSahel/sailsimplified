export type SelectableTransform = {
  id: string;
  name: string;
  type: string;
  internal?: boolean;
  attributes?: Record<string, unknown>;
  /**
   * Number of times this transform is referenced across identity profiles
   * and other transforms. `undefined` means the data was unavailable
   * (e.g. identity-profiles endpoint failed) — distinct from `0`.
   */
  usages?: number;
  /**
   * ISO timestamp returned by `/v2025/transforms` for the last edit. May
   * be absent on built-in transforms or older list payloads — the table
   * renders an em-dash and skips the stale check in that case.
   */
  modified?: string;
};
