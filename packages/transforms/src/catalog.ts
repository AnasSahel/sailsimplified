import type { TransformGroupSlug } from "./groups";

/**
 * Catalogue of attribute schemas per transform type, used by the Recipe
 * view to render a form-based editor. Sourced from the SailPoint docs at
 * https://developer.sailpoint.com/docs/extensibility/transforms/operations
 *
 * Two-level structure:
 *   - `attrs` — the "primary" attributes for this type, always rendered
 *     in the card body
 *   - `advancedAttrs` — attributes that exist but are rarely tweaked
 *     (sortAttribute, propertyFilter, requiresPeriodicRefresh, etc.).
 *     Rendered behind an "Advanced" disclosure on the card.
 *
 * If a type isn't in the catalogue, the Recipe view falls back to "switch
 * to Raw JSON" — no breakage for unsupported types.
 */

export type AttrType =
  | "text"
  | "bool"
  | "number"
  | "select"
  | "select-source"
  | "select-transform"
  | "kv"
  | "transform-list"
  | "transform" // single nested transform (e.g. dateMath.input)
  | "transform-map"; // arbitrary placeholder bindings: Record<string, primitive | nested transform>

export type AttrSchema = {
  /**
   * Attribute key on the underlying transform JSON.
   *
   * For most types, this is the literal key under `attributes` — e.g. `k: "expression"`
   * maps to `attrs.expression`.
   *
   * `transform-map` is special: its bindings live at the ROOT of `attrs`
   * (any key that is NOT declared by another schema in the same entry is a
   * binding). For this type, `k` is just a stable identifier for the control
   * (used for React keys and a11y) and is NOT a path into `attrs`.
   */
  k: string;
  label: string;
  t: AttrType;
  required?: boolean;
  default?: unknown;
  hint?: string;
  description?: string;
  placeholder?: string;
  /** For `t: "select"` — the available options. */
  options?: string[];
};

export type CatalogEntry = {
  type: string;
  group: TransformGroupSlug;
  description: string;
  /**
   * A leaf is terminal in the recipe chain — it has no `input` and is
   * never wrapped by another transform from below. Sources (`accountAttribute`,
   * `identityAttribute`), `static`, `rule`, and `reference` are leaves.
   */
  leaf: boolean;
  /**
   * An aggregator takes a *list* of inputs (rendered as a side group with
   * its own left guide) instead of a single chained `input`. Currently
   * `concat` and `firstValid`. Aggregators have `leaf: false`.
   */
  aggregator?: boolean;
  attrs: AttrSchema[];
  advancedAttrs?: AttrSchema[];
};

export const CATALOG: ReadonlyArray<CatalogEntry> = [
  // ── Source / context (leaves) ────────────────────────────────────────
  {
    type: "accountAttribute",
    group: "lookup",
    description: "Read an attribute from a connected source's account.",
    leaf: true,
    attrs: [
      {
        k: "sourceName",
        label: "Source",
        t: "select-source",
        required: true,
      },
      {
        k: "attributeName",
        label: "Attribute name",
        t: "text",
        required: true,
        placeholder: "e.g. mail",
      },
    ],
    advancedAttrs: [
      {
        k: "accountSortAttribute",
        label: "Sort attribute",
        t: "text",
        default: "created",
      },
      {
        k: "accountSortDescending",
        label: "Sort descending",
        t: "bool",
        default: false,
      },
      {
        k: "accountReturnFirstLink",
        label: "Return first link",
        t: "bool",
        default: false,
      },
      {
        k: "accountFilter",
        label: "Account filter",
        t: "text",
        hint: "BeanShell expression",
      },
      {
        k: "accountPropertyFilter",
        label: "Property filter",
        t: "text",
        hint: "Filter on resolved properties",
      },
      {
        k: "requiresPeriodicRefresh",
        label: "Periodic refresh",
        t: "bool",
        default: false,
      },
    ],
  },
  {
    type: "identityAttribute",
    group: "lookup",
    description: "Read an attribute from the unified identity.",
    leaf: true,
    attrs: [
      {
        k: "name",
        label: "Attribute name",
        t: "text",
        required: true,
        placeholder: "e.g. firstname",
      },
    ],
    advancedAttrs: [
      {
        k: "requiresPeriodicRefresh",
        label: "Periodic refresh",
        t: "bool",
        default: false,
      },
    ],
  },
  {
    type: "reference",
    group: "lookup",
    description: "Delegate to another named transform in the tenant.",
    leaf: true,
    attrs: [
      {
        k: "id",
        label: "Transform",
        t: "select-transform",
        required: true,
      },
    ],
  },
  {
    type: "getReferenceIdentityAttribute",
    group: "lookup",
    description:
      "Read an attribute from a referenced identity (e.g. the current identity's manager).",
    leaf: true,
    attrs: [
      {
        k: "uid",
        label: "Reference type",
        t: "text",
        required: true,
        placeholder: "manager",
        hint: "e.g. manager, sponsor, or an identity username",
      },
      {
        k: "attributeName",
        label: "Attribute name",
        t: "text",
        required: true,
        placeholder: "email",
        hint: "Attribute to read on the referenced identity",
      },
    ],
  },
  {
    type: "static",
    group: "static",
    description:
      "Return a fixed string. Supports Apache Velocity ($var, ${var}) referencing other named attrs.",
    leaf: true,
    attrs: [
      {
        k: "value",
        label: "Value",
        t: "text",
        required: true,
        hint: "Plain text, or VTL with $variableName placeholders",
      },
    ],
  },
  {
    type: "rule",
    group: "other",
    description: "Run a SailPoint cloud rule (Beanshell).",
    leaf: true,
    attrs: [
      {
        k: "name",
        label: "Rule name",
        t: "text",
        required: true,
      },
    ],
  },

  // ── String ops (leaves except concat) ────────────────────────────────
  {
    type: "upper",
    group: "string-ops",
    description: "Convert input to UPPERCASE.",
    leaf: false,
    attrs: [],
  },
  {
    type: "lower",
    group: "string-ops",
    description: "Convert input to lowercase.",
    leaf: false,
    attrs: [],
  },
  {
    type: "trim",
    group: "string-ops",
    description: "Trim leading and trailing whitespace.",
    leaf: false,
    attrs: [],
  },
  {
    type: "concat",
    group: "string-ops",
    description: "Join multiple values into one string.",
    leaf: false,
    aggregator: true,
    attrs: [
      {
        k: "values",
        label: "Values",
        t: "transform-list",
        required: true,
      },
    ],
  },
  {
    type: "join",
    group: "string-ops",
    description: "Join multiple values into one string with a delimiter.",
    leaf: false,
    aggregator: true,
    attrs: [
      {
        k: "values",
        label: "Values",
        t: "transform-list",
        required: true,
      },
      {
        k: "delimiter",
        label: "Delimiter",
        t: "text",
        required: true,
        default: ",",
      },
    ],
  },
  {
    type: "split",
    group: "string-ops",
    description: "Split the input by a delimiter and return one part.",
    leaf: false,
    attrs: [
      {
        k: "delimiter",
        label: "Delimiter",
        t: "text",
        required: true,
        default: " ",
      },
      {
        k: "index",
        label: "Index",
        t: "number",
        required: true,
        default: 0,
        hint: "0 = first segment, -1 = last",
      },
    ],
    advancedAttrs: [
      {
        k: "throws",
        label: "Throws on missing index",
        t: "bool",
        default: false,
      },
    ],
  },
  {
    type: "substring",
    group: "string-ops",
    description: "Extract a slice of the input string.",
    leaf: false,
    attrs: [
      { k: "begin", label: "Begin", t: "number", required: true, default: 0 },
      { k: "end", label: "End", t: "number" },
    ],
    advancedAttrs: [
      {
        k: "beginOffset",
        label: "Begin offset",
        t: "number",
        default: 0,
      },
      { k: "endOffset", label: "End offset", t: "number", default: 0 },
    ],
  },
  {
    type: "indexOf",
    group: "string-ops",
    description:
      "Position of the first occurrence of a substring in the input (or -1).",
    leaf: false,
    attrs: [
      {
        k: "substring",
        label: "Substring",
        t: "text",
        required: true,
        hint: "Text to search for",
      },
    ],
  },
  {
    type: "lastIndexOf",
    group: "string-ops",
    description:
      "Position of the last occurrence of a substring in the input (or -1).",
    leaf: false,
    attrs: [
      {
        k: "substring",
        label: "Substring",
        t: "text",
        required: true,
        hint: "Text to search for",
      },
    ],
  },
  {
    type: "leftPad",
    group: "string-ops",
    description:
      "Pad the input on the left until it reaches a target length.",
    leaf: false,
    attrs: [
      {
        k: "length",
        label: "Length",
        t: "number",
        required: true,
        default: 10,
        hint: "Target total length",
      },
      {
        k: "padding",
        label: "Padding",
        t: "text",
        required: true,
        default: " ",
        hint: "Character(s) used to pad",
      },
    ],
  },
  {
    type: "rightPad",
    group: "string-ops",
    description:
      "Pad the input on the right until it reaches a target length.",
    leaf: false,
    attrs: [
      {
        k: "length",
        label: "Length",
        t: "number",
        required: true,
        default: 10,
        hint: "Target total length",
      },
      {
        k: "padding",
        label: "Padding",
        t: "text",
        required: true,
        default: " ",
        hint: "Character(s) used to pad",
      },
    ],
  },
  {
    type: "getEndOfString",
    group: "string-ops",
    description: "Return the last N characters of the input.",
    leaf: false,
    attrs: [
      {
        k: "numChars",
        label: "Number of characters",
        t: "number",
        required: true,
        default: 4,
        hint: "How many characters to keep from the end",
      },
    ],
  },
  {
    type: "replace",
    group: "string-ops",
    description: "Replace the first regex match in the input.",
    leaf: false,
    attrs: [
      { k: "regex", label: "Regex", t: "text", required: true },
      { k: "replacement", label: "Replacement", t: "text", required: true },
    ],
  },
  {
    type: "replaceAll",
    group: "string-ops",
    description: "Apply a key/value table of regex → replacement.",
    leaf: false,
    attrs: [
      { k: "table", label: "Replacements", t: "kv", required: true },
    ],
  },

  // ── Random / generators (leaves — no input piped in) ─────────────────
  {
    type: "generateRandomString",
    group: "string-ops",
    description:
      "Generate a random string. Letters always; digits/special chars are opt-in.",
    leaf: true,
    attrs: [
      {
        k: "length",
        label: "Length",
        t: "number",
        required: true,
        default: 12,
        hint: "Number of characters to generate",
      },
      {
        k: "includeNumbers",
        label: "Include digits",
        t: "bool",
        default: true,
      },
      {
        k: "includeSpecialChars",
        label: "Include special chars",
        t: "bool",
        default: false,
      },
    ],
  },
  {
    type: "randomAlphanumeric",
    group: "string-ops",
    description: "Generate a random string of letters and digits.",
    leaf: true,
    attrs: [
      {
        k: "length",
        label: "Length",
        t: "number",
        required: true,
        default: 12,
        hint: "Number of characters to generate",
      },
    ],
  },
  {
    type: "randomNumeric",
    group: "string-ops",
    description: "Generate a random string of digits only.",
    leaf: true,
    attrs: [
      {
        k: "length",
        label: "Length",
        t: "number",
        required: true,
        default: 12,
        hint: "Number of digits to generate",
      },
    ],
  },
  {
    type: "uuid",
    group: "string-ops",
    description: "Generate a random UUID v4.",
    leaf: true,
    attrs: [],
  },

  // ── Normalization ─────────────────────────────────────────────────────
  {
    type: "normalizeNames",
    group: "normalization",
    description:
      "Title-case names (Mc/Mac, von/de/la lowercase, Roman numerals upper).",
    leaf: false,
    attrs: [],
  },
  {
    type: "decomposeDiacriticalMarks",
    group: "normalization",
    description: "Strip diacritics (Café → Cafe).",
    leaf: false,
    attrs: [],
  },

  // ── Logic / composition ──────────────────────────────────────────────
  {
    type: "firstValid",
    group: "lookup",
    description:
      "Return the first non-empty value among inputs. Walks fallbacks in order.",
    leaf: false,
    aggregator: true,
    attrs: [
      {
        k: "values",
        label: "Values",
        t: "transform-list",
        required: true,
      },
      {
        k: "ignoreErrors",
        label: "Ignore errors",
        t: "bool",
        default: false,
      },
    ],
  },
  {
    type: "lookup",
    group: "lookup",
    description:
      "Map the input via a static key/value table. Falls back to `default` key.",
    leaf: false,
    attrs: [
      { k: "table", label: "Lookup table", t: "kv", required: true },
    ],
  },
  {
    type: "conditional",
    group: "conditional",
    description:
      "If/else branching on an equality expression. Only `eq` operator supported by SailPoint.",
    leaf: false,
    attrs: [
      {
        k: "expression",
        label: "Expression",
        t: "text",
        required: true,
        hint: "e.g. $value eq 'EXT' (only eq is supported)",
      },
      {
        k: "positiveCondition",
        label: "If true return",
        t: "text",
        required: true,
      },
      {
        k: "negativeCondition",
        label: "If false return",
        t: "text",
        required: true,
      },
      {
        // Bindings live at the root of `attrs` — any key that isn't one of the
        // three declared above is treated as a `$name` placeholder referenced
        // by the expression. `k` here is just a control identifier; it is not
        // a sub-path into `attrs`.
        k: "bindings",
        label: "Placeholder bindings",
        t: "transform-map",
        description:
          "Bind any $name placeholder used in the expression to either a primitive value or a sub-transform.",
      },
    ],
  },

  // ── Format ────────────────────────────────────────────────────────────
  {
    type: "displayName",
    group: "format",
    description:
      "Compose `(preferredName ?? givenName) + ' ' + familyName` from the identity.",
    leaf: false,
    attrs: [],
  },
  {
    type: "e164phone",
    group: "format",
    description:
      "Convert a phone number to E.164. Returns null if input isn't a valid phone.",
    leaf: false,
    attrs: [
      {
        k: "defaultRegion",
        label: "Default region",
        t: "select",
        default: "US",
        options: [
          "US",
          "FR",
          "GB",
          "DE",
          "ES",
          "IT",
          "BE",
          "NL",
          "CH",
          "PT",
          "IE",
          "LU",
          "CA",
          "AU",
        ],
      },
    ],
    advancedAttrs: [
      {
        k: "stripExtension",
        label: "Strip extension",
        t: "bool",
        default: true,
      },
      {
        k: "requiresPeriodicRefresh",
        label: "Periodic refresh",
        t: "bool",
        default: false,
      },
    ],
  },
  {
    type: "iso3166",
    group: "format",
    description:
      "Look up a country and emit its ISO-3166 code in the requested format.",
    leaf: false,
    attrs: [
      {
        k: "format",
        label: "Output format",
        t: "select",
        default: "alpha2",
        options: ["alpha2", "alpha3", "numeric", "name"],
      },
    ],
  },
  {
    type: "rfc5646",
    group: "format",
    description: "Look up a language and emit its RFC 5646 tag.",
    leaf: false,
    attrs: [],
  },

  // ── Date ──────────────────────────────────────────────────────────────
  {
    type: "dateFormat",
    group: "date",
    description: "Reformat a datetime string.",
    leaf: false,
    attrs: [
      {
        k: "inputFormat",
        label: "Input format",
        t: "text",
        hint: "Java SimpleDateFormat (yyyy-MM-dd, etc.)",
      },
      {
        k: "outputFormat",
        label: "Output format",
        t: "text",
        default: "yyyy-MM-dd",
      },
    ],
  },
  {
    type: "dateMath",
    group: "date",
    description: "Add, subtract, or round a timestamp.",
    leaf: false,
    attrs: [
      {
        k: "expression",
        label: "Expression",
        t: "text",
        required: true,
        hint: "e.g. now+1d/d (now plus 1 day, rounded down)",
      },
      { k: "roundUp", label: "Round up", t: "bool", default: false },
    ],
  },
  {
    type: "dateCompare",
    group: "date",
    description: "Compare two dates and return one of two values.",
    leaf: false,
    attrs: [
      {
        k: "firstDate",
        label: "First date",
        t: "transform",
        required: true,
        hint: "Sub-transform returning a date string (e.g. accountAttribute)",
      },
      {
        k: "secondDate",
        label: "Second date",
        t: "transform",
        required: true,
        hint: "Sub-transform returning a date string",
      },
      {
        k: "operator",
        label: "Operator",
        t: "select",
        required: true,
        options: ["LT", "LTE", "EQ", "GT", "GTE", "NEQ"],
      },
      {
        k: "positiveCondition",
        label: "If true return",
        t: "text",
        required: true,
      },
      {
        k: "negativeCondition",
        label: "If false return",
        t: "text",
        required: true,
      },
    ],
  },

  // ── Encoding ─────────────────────────────────────────────────────────
  {
    type: "base64Encode",
    group: "encoding",
    description: "Encode the input to Base64.",
    leaf: false,
    attrs: [],
  },
  {
    type: "base64Decode",
    group: "encoding",
    description: "Decode a Base64 string back to UTF-8.",
    leaf: false,
    attrs: [],
  },
];

const BY_TYPE: Map<string, CatalogEntry> = new Map(
  CATALOG.map((entry) => [entry.type, entry]),
);

export function getCatalogEntry(type: string): CatalogEntry | undefined {
  return BY_TYPE.get(type);
}

export function knownCatalogTypes(): string[] {
  return CATALOG.map((e) => e.type);
}

/**
 * In the recipe view, a chain step is a non-leaf, non-aggregator type
 * that takes its input via `attributes.input` (rendered as a dotted
 * connector below the card pointing at the next step).
 */
export function isChainType(type: string): boolean {
  const e = BY_TYPE.get(type);
  return !!e && !e.leaf && !e.aggregator;
}

export function isAggregator(type: string): boolean {
  return !!BY_TYPE.get(type)?.aggregator;
}

export function isLeafType(type: string): boolean {
  return !!BY_TYPE.get(type)?.leaf;
}
