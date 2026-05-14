/**
 * Per-type starter templates — used by the editor's Type Picker (when
 * switching root type) and the Insert Transform dialog (when adding a
 * sub-transform at the cursor).
 *
 * Each template is a minimal but valid JSON skeleton for that type, with
 * placeholder values where the user needs to fill in.
 */

export type TransformSkeleton = {
  type: string;
  attributes: Record<string, unknown>;
};

const TEMPLATES: Record<string, TransformSkeleton["attributes"]> = {
  // String ops — most need no attrs
  upper: {},
  lower: {},
  trim: {},
  concat: { values: ["", ""] },
  join: { values: ["", ""], delimiter: "," },
  split: { delimiter: " ", index: 0 },
  substring: { begin: 0 },
  indexOf: { substring: "" },
  lastIndexOf: { substring: "" },
  leftPad: { length: 10, padding: " " },
  rightPad: { length: 10, padding: " " },
  getEndOfString: { numChars: 4 },
  generateRandomString: {
    length: 12,
    includeNumbers: true,
    includeSpecialChars: false,
  },
  randomAlphanumeric: { length: 12 },
  randomNumeric: { length: 12 },
  uuid: {},
  replace: { regex: "", replacement: "" },
  replaceAll: { table: {} },
  static: { value: "" },

  // Normalization
  normalizeNames: {},
  decomposeDiacriticalMarks: {},

  // Format
  e164phone: { defaultRegion: "FR" },
  iso3166: { format: "alpha2" },
  rfc5646: {},
  displayName: { input: "input" },
  dateFormat: { outputFormat: "yyyy-MM-dd" },

  // Composition
  firstValid: { values: [] },
  reference: { id: "" },
  lookup: { table: { default: "" } },

  // Encoding
  base64Encode: {},
  base64Decode: {},

  // Context
  accountAttribute: { sourceName: "", attributeName: "" },
  identityAttribute: { name: "" },
  getReferenceIdentityAttribute: { uid: "manager", attributeName: "" },

  // Conditional / date math — testable locally
  conditional: {
    expression: "$value eq EXTERNAL",
    positiveCondition: "",
    negativeCondition: "",
  },
  dateCompare: {
    firstDate: { type: "accountAttribute", attributes: {} },
    secondDate: { type: "accountAttribute", attributes: {} },
    operator: "LT",
    positiveCondition: "",
    negativeCondition: "",
  },
  dateMath: {
    expression: "now+1d",
    roundUp: false,
  },

  // Unsupported placeholders — still produce a skeleton so the user can
  // edit it and ship to SailPoint even if the local evaluator can't run it
  rule: { name: "" },
};

export function templateFor(type: string): TransformSkeleton {
  return {
    type,
    attributes: { ...(TEMPLATES[type] ?? {}) },
  };
}

export function namedTemplateFor(type: string, name: string): TransformSkeleton & { name: string } {
  return { name, ...templateFor(type) };
}
