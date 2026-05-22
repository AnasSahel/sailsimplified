/**
 * Smoke test for getReferenceIdentityAttribute — nominal + missing paths.
 *
 * Run via tsx (`pnpm dlx tsx packages/transforms/test-reference-identity.ts`).
 * Not registered in any test runner — this is a one-shot sanity check, the
 * pattern established by the #84 batch of pure-spec types.
 */

import {
  collectRequiredInputs,
  evaluateTransform,
  getSpec,
} from "./src/index";
import type {
  EvaluableTransform,
  RequiredSimulationInput,
} from "./src/index";

type TestCase = {
  name: string;
  transform: EvaluableTransform;
  simulatedValues: Record<string, string>;
  expectedOk: boolean;
  expectedOutput?: string;
  expectedErrorIncludes?: string;
  expectedInputs?: ReadonlyArray<Pick<RequiredSimulationInput, "id" | "label">>;
};

const transformsByName = new Map<string, EvaluableTransform>();

const cases: TestCase[] = [
  {
    name: "nominal — manager.email populated",
    transform: {
      id: "t-1",
      name: "manager-email",
      type: "getReferenceIdentityAttribute",
      attributes: { uid: "manager", attributeName: "email" },
    },
    simulatedValues: { "reference.manager.email": "alice@example.com" },
    expectedOk: true,
    expectedOutput: "alice@example.com",
    expectedInputs: [
      { id: "reference.manager.email", label: "manager.email" },
    ],
  },
  {
    name: "missing key — manager.email not in simulatedValues",
    transform: {
      id: "t-2",
      name: "manager-email",
      type: "getReferenceIdentityAttribute",
      attributes: { uid: "manager", attributeName: "email" },
    },
    simulatedValues: {},
    expectedOk: false,
    expectedErrorIncludes: "reference.manager.email",
  },
  {
    name: "missing uid — empty attrs",
    transform: {
      id: "t-3",
      name: "broken",
      type: "getReferenceIdentityAttribute",
      attributes: { attributeName: "email" },
    },
    simulatedValues: {},
    expectedOk: false,
    expectedErrorIncludes: "Missing `uid`",
  },
  {
    name: "missing attributeName — only uid set",
    transform: {
      id: "t-4",
      name: "broken-2",
      type: "getReferenceIdentityAttribute",
      attributes: { uid: "manager" },
    },
    simulatedValues: {},
    expectedOk: false,
    expectedErrorIncludes: "Missing `uid` or `attributeName`",
  },
  {
    name: "sponsor.firstName — different uid",
    transform: {
      id: "t-5",
      name: "sponsor-fn",
      type: "getReferenceIdentityAttribute",
      attributes: { uid: "sponsor", attributeName: "firstName" },
    },
    simulatedValues: { "reference.sponsor.firstName": "Bob" },
    expectedOk: true,
    expectedOutput: "Bob",
    expectedInputs: [
      { id: "reference.sponsor.firstName", label: "sponsor.firstName" },
    ],
  },
  {
    name: "empty string value is honoured (treated as present)",
    transform: {
      id: "t-6",
      name: "manager-mid",
      type: "getReferenceIdentityAttribute",
      attributes: { uid: "manager", attributeName: "middleName" },
    },
    simulatedValues: { "reference.manager.middleName": "" },
    expectedOk: true,
    expectedOutput: "",
  },
];

let passed = 0;
let failed = 0;

for (const tc of cases) {
  const result = evaluateTransform(tc.transform, "ignored-input", {
    transformsByName,
    simulatedValues: tc.simulatedValues,
  });

  let pass = true;
  let why = "";

  if (tc.expectedOk) {
    if (!result.ok) {
      pass = false;
      why = `expected ok, got error: ${result.error}`;
    } else if (
      tc.expectedOutput !== undefined &&
      result.output !== tc.expectedOutput
    ) {
      pass = false;
      why = `expected output ${JSON.stringify(tc.expectedOutput)}, got ${JSON.stringify(result.output)}`;
    }
  } else {
    if (result.ok) {
      pass = false;
      why = `expected error, got ok with output ${JSON.stringify(result.output)}`;
    } else if (
      tc.expectedErrorIncludes &&
      !result.error.includes(tc.expectedErrorIncludes)
    ) {
      pass = false;
      why = `expected error to include "${tc.expectedErrorIncludes}", got: ${result.error}`;
    }
  }

  // Also verify directInputs output for nominal cases.
  if (pass && tc.expectedInputs) {
    const inputs = collectRequiredInputs(tc.transform, transformsByName);
    const got = inputs.map((i) => ({ id: i.id, label: i.label }));
    const want = tc.expectedInputs;
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      pass = false;
      why = `expected inputs ${JSON.stringify(want)}, got ${JSON.stringify(got)}`;
    }
  }

  if (pass) {
    passed++;
    console.log(`  PASS  ${tc.name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${tc.name}`);
    console.log(`        ${why}`);
  }
}

// Sanity check the spec is actually registered.
if (!getSpec("getReferenceIdentityAttribute")) {
  console.log(
    "  FAIL  spec not registered in TRANSFORM_REGISTRY — check registry.ts",
  );
  failed++;
} else {
  console.log("  PASS  spec registered in TRANSFORM_REGISTRY");
  passed++;
}

console.log("");
console.log(`Results: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
