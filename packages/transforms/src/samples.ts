/**
 * Sample input values per transform type — populates the "Use sample"
 * link in the test runner. Picked to surface the type's specific
 * behaviour quickly (e.g. an accented name for normalizeNames).
 */

const SAMPLES: Record<string, string> = {
  upper: "hello world",
  lower: "HELLO WORLD",
  trim: "   hello world   ",
  concat: "John",
  split: "John Doe Smith",
  substring: "Hello World",
  replace: "Hello World",
  replaceAll: "Hello World",
  normalizeNames: "JEAN-MARIE-JOSÉPHINE  DUBOIS-DUPONT",
  decomposeDiacriticalMarks: "Café Résumé Naïve Œuvre",
  static: "(any input ignored)",
  firstValid: "input",
  e164phone: "06 12 34 56 78",
  iso3166: "France",
  rfc5646: "FR-FR",
  displayName: "John Doe",
  base64Encode: "Hello World",
  base64Decode: "SGVsbG8gV29ybGQ=",
  dateFormat: "2026-05-08",
  reference: "input",
  accountAttribute: "(needs SailPoint account)",
  identityAttribute: "(needs SailPoint identity)",
  getReferenceIdentityAttribute: "(needs referenced identity)",
  rule: "(rule code)",
  conditional: "input",
  dateCompare: "2026-05-08",
  dateMath: "2026-05-08",
};

export function sampleFor(type: string): string {
  return SAMPLES[type] ?? "input";
}
