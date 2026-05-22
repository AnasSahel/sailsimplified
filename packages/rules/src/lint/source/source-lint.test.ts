/**
 * Tests for the source-lint engine + the five source detectors, driven by the
 * golden fixtures (the single source of truth for each smell's shape).
 *
 *   node --experimental-strip-types --test src/lint/source/source-lint.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { analyzeSource } from "../../analysis/analyze.ts";
import {
  API_IN_LOOP,
  CLEAN_BUILD_MAP,
  DEAD_CODE,
  DEPRECATED_API,
  GUARDED_DEREF,
  HARDCODED_SECRETS,
  UNGUARDED_DEREF,
} from "../../analysis/fixtures.ts";
import { runSourceLint } from "./engine.ts";

const lint = (script: string) => runSourceLint("rule-x", analyzeSource(script));
const byDetector = (script: string, id: string) =>
  lint(script).issues.filter((i) => i.detectorId === id);

describe("clean rule", () => {
  it("produces no source issues", () => {
    assert.equal(lint(CLEAN_BUILD_MAP).issues.length, 0);
  });
});

describe("deprecated-api (correctness)", () => {
  it("flags context.getObjectByName with a located warning", () => {
    const issues = byDetector(DEPRECATED_API, "deprecated-api");
    assert.equal(issues.length, 1);
    assert.equal(issues[0].severity, "warning");
    assert.equal(issues[0].location?.line, 1);
    assert.ok(issues[0].location?.snippet?.includes("getObjectByName"));
  });

  it("flags Thread.sleep as an error", () => {
    const issues = byDetector(`Thread.sleep(1000);`, "deprecated-api");
    assert.equal(issues.length, 1);
    assert.equal(issues[0].severity, "error");
  });
});

describe("null-safety (correctness)", () => {
  it("flags an unguarded deref of a call result", () => {
    const issues = byDetector(UNGUARDED_DEREF, "null-safety");
    assert.equal(issues.length, 1);
    assert.ok(issues[0].location?.line);
  });

  it("does not flag a guarded deref", () => {
    assert.equal(byDetector(GUARDED_DEREF, "null-safety").length, 0);
  });

  it("does not flag a deref of a non-ISC (JDK) call result", () => {
    // Instant.now()/now.plus(...) never return null — flagging them is noise.
    const script = `Instant now = Instant.now();\nInstant exp = now.plus(60, ChronoUnit.SECONDS);\nlong e = exp.getEpochSecond();`;
    assert.equal(byDetector(script, "null-safety").length, 0);
  });
});

describe("api-in-loop (perf)", () => {
  it("flags a call inside a loop body", () => {
    const issues = byDetector(API_IN_LOOP, "api-in-loop");
    assert.equal(issues.length, 1);
    assert.ok(issues[0].message.includes("iteration"));
  });

  it("does not flag a call outside any loop", () => {
    assert.equal(byDetector(DEPRECATED_API, "api-in-loop").length, 0);
  });
});

describe("dead-code (hygiene)", () => {
  it("flags an unreachable statement after return AND an unused local", () => {
    const issues = byDetector(DEAD_CODE, "dead-code");
    const messages = issues.map((i) => i.message).join("\n");
    assert.ok(messages.includes("Unreachable"));
    assert.ok(messages.includes("never read"));
  });

  it("does not flag a return followed by a branch continuation", () => {
    const script = `if (x) { return 1; } else { return 2; }`;
    const issues = byDetector(script, "dead-code");
    assert.equal(issues.filter((i) => i.message.includes("Unreachable")).length, 0);
  });
});

describe("hardcoded-secrets (hygiene)", () => {
  it("flags a secret as error and a hardcoded id as warning", () => {
    const issues = byDetector(HARDCODED_SECRETS, "hardcoded-secrets");
    assert.equal(issues.length, 2);
    assert.ok(issues.some((i) => i.severity === "error"));
    assert.ok(issues.some((i) => i.severity === "warning"));
  });
});

describe("runSourceLint aggregate", () => {
  it("counts errors and warnings", () => {
    const result = lint(HARDCODED_SECRETS);
    assert.equal(result.errorCount, 1);
    assert.equal(result.warningCount, 1);
    assert.equal(result.issues.length, 2);
  });
});
