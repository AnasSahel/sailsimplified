/**
 * Group is a derived metadata field — SailPoint doesn't ship a "group"
 * concept on transforms natively. We bucket each `type` into one of a
 * fixed set of conceptual groups so users can filter by intent
 * ("show me all the lookup transforms") rather than by exact type
 * ("show me everything tagged `accountAttribute`").
 *
 * If SailPoint ever adds a native group field, swap the implementation
 * of `groupFor` and the rest of the app keeps working.
 */

export const TRANSFORM_GROUPS = {
  format: { slug: "format", label: "Format" },
  "string-ops": { slug: "string-ops", label: "String ops" },
  lookup: { slug: "lookup", label: "Lookup" },
  normalization: { slug: "normalization", label: "Normalization" },
  date: { slug: "date", label: "Date" },
  conditional: { slug: "conditional", label: "Conditional" },
  encoding: { slug: "encoding", label: "Encoding" },
  static: { slug: "static", label: "Static" },
  other: { slug: "other", label: "Other" },
} as const satisfies Record<string, { slug: string; label: string }>;

export type TransformGroupSlug = keyof typeof TRANSFORM_GROUPS;
export type TransformGroup = (typeof TRANSFORM_GROUPS)[TransformGroupSlug];

const TYPE_TO_GROUP: Record<string, TransformGroupSlug> = {
  // Format
  e164phone: "format",
  iso3166: "format",
  rfc5646: "format",
  displayName: "format",
  // String ops
  upper: "string-ops",
  lower: "string-ops",
  trim: "string-ops",
  concat: "string-ops",
  split: "string-ops",
  substring: "string-ops",
  replace: "string-ops",
  replaceAll: "string-ops",
  indexOf: "string-ops",
  lastIndexOf: "string-ops",
  join: "string-ops",
  leftPad: "string-ops",
  rightPad: "string-ops",
  getEndOfString: "string-ops",
  generateRandomString: "string-ops",
  randomAlphanumeric: "string-ops",
  randomNumeric: "string-ops",
  uuid: "string-ops",
  // Lookup
  accountAttribute: "lookup",
  identityAttribute: "lookup",
  getReferenceIdentityAttribute: "lookup",
  reference: "lookup",
  lookup: "lookup",
  firstValid: "lookup",
  // Normalization
  normalizeNames: "normalization",
  decomposeDiacriticalMarks: "normalization",
  // Date
  dateCompare: "date",
  dateFormat: "date",
  dateMath: "date",
  // Conditional
  conditional: "conditional",
  // Encoding
  base64Encode: "encoding",
  base64Decode: "encoding",
  // Static
  static: "static",
};

export function groupFor(type: string): TransformGroup {
  const slug = TYPE_TO_GROUP[type] ?? "other";
  return TRANSFORM_GROUPS[slug];
}

export function groupSlugFromParam(value: string | undefined): TransformGroupSlug | null {
  if (!value) return null;
  return value in TRANSFORM_GROUPS ? (value as TransformGroupSlug) : null;
}
