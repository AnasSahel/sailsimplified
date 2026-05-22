/**
 * Inline smoke assertions for `extractAutoSamples`. The package has no
 * test runner configured (`pnpm typecheck` is the only quality gate),
 * so this file is meant to be run with `tsx` ad-hoc when verifying:
 *
 *   npx tsx packages/transforms/src/auto-samples.test.ts
 *
 * Exits with code 0 on success, throws (non-zero) on first failure.
 * Keep this small and obvious — anything more elaborate justifies a
 * real test runner.
 */

import { extractAutoSamples } from "./auto-samples";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`);
  }
  console.log(`PASS ${label}`);
}

// lookup — table keys (default filtered out, blank filtered out, dedup)
assertEqual(
  extractAutoSamples({
    type: "lookup",
    attributes: {
      table: { A: "x", B: "y", default: "z" },
    },
  }),
  ["A", "B"],
  "lookup: returns table keys minus default",
);

assertEqual(
  extractAutoSamples({
    type: "lookup",
    attributes: {
      table: { "": "drop", FOO: "y", default: "z" },
    },
  }),
  ["FOO"],
  "lookup: filters out empty-string keys",
);

assertEqual(
  extractAutoSamples({
    type: "lookup",
    attributes: { table: {} },
  }),
  [],
  "lookup: empty table yields no samples",
);

assertEqual(
  extractAutoSamples({
    type: "lookup",
    attributes: {},
  }),
  [],
  "lookup: missing table yields no samples",
);

assertEqual(
  extractAutoSamples({
    type: "lookup",
    attributes: { table: "not-an-object" },
  }),
  [],
  "lookup: non-object table yields no samples",
);

// Non-deterministic / unsupported types — all return []
assertEqual(
  extractAutoSamples({
    type: "firstValid",
    attributes: { values: ["a", "b"] },
  }),
  [],
  "firstValid: no auto-extract in v0",
);

assertEqual(
  extractAutoSamples({
    type: "conditional",
    attributes: {
      expression: "$x eq EXTERNAL",
      positiveCondition: "Yes",
      negativeCondition: "No",
    },
  }),
  [],
  "conditional: no auto-extract in v0",
);

assertEqual(
  extractAutoSamples({
    type: "replace",
    attributes: { regex: "[aeiou]", replacement: "_" },
  }),
  [],
  "replace: no auto-extract in v0",
);

assertEqual(
  extractAutoSamples({
    type: "replaceAll",
    attributes: { table: { foo: "bar" } },
  }),
  [],
  "replaceAll: no auto-extract in v0",
);

assertEqual(
  extractAutoSamples({ type: "static", attributes: { value: "x" } }),
  [],
  "static: no input variation",
);

assertEqual(
  extractAutoSamples({ type: "concat", attributes: {} }),
  [],
  "concat: unknown space defaults to []",
);

assertEqual(
  extractAutoSamples({ type: "unknownType" }),
  [],
  "unknown type defaults to []",
);

assertEqual(
  extractAutoSamples({ type: "lookup" }),
  [],
  "lookup with no attributes at all yields []",
);

console.log("\nAll assertions passed.");
