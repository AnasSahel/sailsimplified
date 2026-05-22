import "server-only";

import { listTransforms } from "./transforms-api";
import { listIdentityProfiles } from "./identities-api";

/**
 * Cross-ref index for the source-detail Schemas tab "Used by" column
 * (issue #264).
 *
 * For a given source `name`, scans every transform on the tenant and
 * every identity profile's `identityAttributeConfig.attributeTransforms`,
 * looking for `accountAttribute` source nodes that match
 * `(sourceName === <this source>, attributeName === <this attr>)`. The
 * column then renders one chip per consumer.
 *
 * Why match on `sourceName` and not `sourceId`: in SailPoint, the
 * canonical `accountAttribute` reference uses `sourceName`, not
 * `sourceId`. The latter exists in some places but invoking a
 * reference-chained transform with `accountAttribute.sourceId` returns
 * null silently — a known ISC null-trap (cf.
 * `feedback_isc_sourceid_breaks_firstvalid` in memory). For this
 * read-only scan the matching predicate stays on `sourceName` for the
 * same reason: that's how authors are guided to write the node.
 *
 * Performance: one fetch per kind, both already needed elsewhere on the
 * source-detail page (identity profiles is fetched today for the
 * identity-profile resolution by authoritative-source.id). Walking the
 * transform tree is O(nodes) per transform — fast for typical tenants
 * (≤ a few hundred transforms × a few dozen nodes each).
 */

type AnyRecord = Record<string, unknown>;

export type TransformConsumerRef = {
  /** Transform id (used in the href). */
  id: string;
  /** Transform name (chip label). */
  name: string;
};

export type IdentityProfileConsumerRef = {
  /** Identity profile id (used in the href). */
  id: string;
  /** Identity profile name (chip label tooltip). */
  name: string;
  /** Identity attribute name that maps this source attribute (chip label). */
  identityAttributeName: string;
};

/** Per-attribute roll-up of cross-link consumers. */
export type AttributeConsumers = {
  transforms: TransformConsumerRef[];
  identityProfiles: IdentityProfileConsumerRef[];
};

/** Empty literal for the "no consumers" case — avoids per-row allocs. */
export const EMPTY_CONSUMERS: AttributeConsumers = {
  transforms: [],
  identityProfiles: [],
};

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Walk an arbitrary transform/transformDefinition subtree and accumulate
 * every `accountAttribute` node whose `sourceName` matches the target
 * source. Mutates `attributesFound` (set of attribute names) for the
 * caller to merge into its per-attribute index.
 */
function collectMatchingAccountAttributes(
  node: unknown,
  targetSourceName: string,
  attributesFound: Set<string>,
): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectMatchingAccountAttributes(item, targetSourceName, attributesFound);
    }
    return;
  }
  if (!isRecord(node)) return;

  if (
    node.type === "accountAttribute" &&
    isRecord(node.attributes) &&
    typeof node.attributes.sourceName === "string" &&
    node.attributes.sourceName === targetSourceName &&
    typeof node.attributes.attributeName === "string"
  ) {
    attributesFound.add(node.attributes.attributeName);
    // Don't return — the attributes bag is a leaf in practice, but
    // a malformed `accountAttribute` could nest unknown shapes. Keep
    // descending so we don't miss anything.
  }

  for (const value of Object.values(node)) {
    collectMatchingAccountAttributes(value, targetSourceName, attributesFound);
  }
}

/**
 * Build the per-attribute consumers map for a source.
 *
 * Best-effort: if either upstream call fails (timeout, 403), the map is
 * still returned but the corresponding side stays empty. The "Used by"
 * column then renders empty cells, which is the same UX as
 * "no consumers found" — degrades silently rather than blocking the
 * Schemas tab.
 */
export async function getSchemaAttributeConsumers(
  userId: string,
  sourceName: string,
): Promise<Map<string, AttributeConsumers>> {
  const [transformsResult, profilesResult] = await Promise.all([
    listTransforms(userId),
    listIdentityProfiles(userId),
  ]);

  const index = new Map<string, AttributeConsumers>();

  const ensure = (attrName: string): AttributeConsumers => {
    let entry = index.get(attrName);
    if (!entry) {
      entry = { transforms: [], identityProfiles: [] };
      index.set(attrName, entry);
    }
    return entry;
  };

  if (transformsResult.ok) {
    for (const t of transformsResult.data) {
      if (!t.attributes) continue;
      const found = new Set<string>();
      collectMatchingAccountAttributes(t.attributes, sourceName, found);
      for (const attrName of found) {
        ensure(attrName).transforms.push({ id: t.id, name: t.name });
      }
    }
  }

  if (profilesResult.ok) {
    type ProfileWithConfig = {
      id: string;
      name?: string;
      identityAttributeConfig?: {
        attributeTransforms?: Array<{
          identityAttributeName?: string;
          transformDefinition?: unknown;
        }>;
      };
    };
    // The /v2025/identity-profiles list endpoint embeds the full
    // identityAttributeConfig — no per-profile follow-up fetch needed.
    // The factory's return type narrows to the summary; we widen here
    // for the walk because we read the deeper config.
    const profiles = profilesResult.data as unknown as ProfileWithConfig[];
    for (const profile of profiles) {
      const entries =
        profile.identityAttributeConfig?.attributeTransforms ?? [];
      for (const entry of entries) {
        const identityAttributeName =
          typeof entry.identityAttributeName === "string"
            ? entry.identityAttributeName
            : null;
        if (!identityAttributeName) continue;
        const found = new Set<string>();
        collectMatchingAccountAttributes(
          entry.transformDefinition,
          sourceName,
          found,
        );
        for (const attrName of found) {
          ensure(attrName).identityProfiles.push({
            id: profile.id,
            name: profile.name ?? "(unnamed identity profile)",
            identityAttributeName,
          });
        }
      }
    }
  }

  // Sort each entry's consumer lists alphabetically so the chip order
  // stays stable across renders and the rendered popover is scannable.
  for (const entry of index.values()) {
    entry.transforms.sort((a, b) => a.name.localeCompare(b.name));
    entry.identityProfiles.sort((a, b) => {
      const byProfile = a.name.localeCompare(b.name);
      if (byProfile !== 0) return byProfile;
      return a.identityAttributeName.localeCompare(b.identityAttributeName);
    });
  }

  return index;
}

/**
 * Source-level roll-up of transforms that reference a given source (issue
 * #269). For each matching transform, surfaces the set of source attributes
 * it pulls from via `accountAttribute` nodes (with `sourceName === source.name`).
 *
 * The Provisioning tab renders one row per transform with:
 *   - transform name + type
 *   - count of referenced attributes + first 3 names (the table cell can
 *     compute "+N more" from the array length).
 *
 * Same matching predicate as `getSchemaAttributeConsumers` — kept on
 * `sourceName` for the reason explained at the top of this file (ISC
 * sourceId-based references silently return null).
 */
export type SourceTransformConsumer = {
  /** Transform id (drives the row href). */
  id: string;
  /** Transform name (column 1). */
  name: string;
  /** Transform type (column 2 — `static`, `firstValid`, `lookup`, …). */
  type: string;
  /** Set of source attribute names this transform references on the source. */
  attributesReferenced: string[];
};

/**
 * List every transform on the tenant that references this source at all
 * (one or more `accountAttribute` nodes with matching `sourceName`).
 *
 * Best-effort: a failed `listTransforms` (timeout, 403) returns an empty
 * array so the Provisioning tab can render an "empty / data unavailable"
 * state rather than blocking.
 */
export async function getSourceTransformConsumers(
  userId: string,
  sourceName: string,
): Promise<SourceTransformConsumer[]> {
  const transformsResult = await listTransforms(userId);
  if (!transformsResult.ok) return [];

  const consumers: SourceTransformConsumer[] = [];
  for (const t of transformsResult.data) {
    if (!t.attributes) continue;
    const found = new Set<string>();
    collectMatchingAccountAttributes(t.attributes, sourceName, found);
    if (found.size === 0) continue;
    consumers.push({
      id: t.id,
      name: t.name,
      type: t.type,
      attributesReferenced: Array.from(found).sort((a, b) =>
        a.localeCompare(b),
      ),
    });
  }
  consumers.sort((a, b) => a.name.localeCompare(b.name));
  return consumers;
}
