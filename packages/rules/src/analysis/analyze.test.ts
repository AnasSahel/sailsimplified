/**
 * Tests for the BeanShell lexer + `analyzeSource`.
 *
 *   node --experimental-strip-types --test src/analysis/analyze.test.ts
 *
 * Asserts the structured facts each golden fixture must yield — the contract
 * the source detectors (#361/#362) and epic B build on.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { tokenize } from "./lexer.ts";
import { analyzeSource } from "./analyze.ts";
import {
  API_IN_LOOP,
  CLEAN_BUILD_MAP,
  DEAD_CODE,
  DEPRECATED_API,
  GUARDED_DEREF,
  HARDCODED_SECRETS,
  UNGUARDED_DEREF,
} from "./fixtures.ts";

describe("tokenize", () => {
  it("classifies keywords, identifiers, strings, numbers", () => {
    const t = tokenize(`int x = 3; String s = "hi";`);
    assert.equal(t.find((x) => x.value === "int")?.kind, "keyword");
    assert.equal(t.find((x) => x.value === "x")?.kind, "identifier");
    assert.equal(t.find((x) => x.value === "3")?.kind, "number");
    assert.equal(t.find((x) => x.value === '"hi"')?.kind, "string");
  });

  it("tracks line numbers across newlines and block comments", () => {
    const t = tokenize(`a\n/* two\nlines */\nb`);
    assert.equal(t.find((x) => x.value === "b")?.line, 4);
  });

  it("does not tokenize inside strings or comments", () => {
    const t = tokenize(`s = "a { b }"; // { not a brace }`);
    assert.equal(t.filter((x) => x.value === "{").length, 0);
  });

  it("gives matching braces the same depth", () => {
    const t = tokenize(`{ a { b } c }`);
    const opens = t.filter((x) => x.value === "{");
    const closes = t.filter((x) => x.value === "}");
    assert.deepEqual(opens.map((x) => x.depth), [0, 1]);
    assert.deepEqual(closes.map((x) => x.depth), [1, 0]);
  });
});

describe("analyzeSource — api calls", () => {
  it("captures receiver + method for a qualified call", () => {
    const a = analyzeSource(DEPRECATED_API);
    const call = a.apiCalls.find((c) => c.method === "getObjectByName");
    assert.ok(call);
    assert.equal(call.receiver, "context");
    assert.equal(call.qualified, "context.getObjectByName");
    assert.equal(call.line, 1);
  });

  it("marks a constructor", () => {
    const a = analyzeSource(CLEAN_BUILD_MAP);
    const ctor = a.apiCalls.find((c) => c.method === "Attributes");
    assert.ok(ctor);
    assert.equal(ctor.isConstructor, true);
  });
});

describe("analyzeSource — loops + containment", () => {
  it("captures a for loop whose body contains an api call", () => {
    const a = analyzeSource(API_IN_LOOP);
    assert.equal(a.loops.length, 1);
    const loop = a.loops[0];
    assert.equal(loop.kind, "for");
    const call = a.apiCalls.find((c) => c.method === "getObjectByName");
    assert.ok(call);
    assert.ok(call.start >= loop.bodyStart && call.start < loop.bodyEnd, "call is inside loop body range");
  });
});

describe("analyzeSource — literals", () => {
  it("classifies an ISC id and a secret-named assignment", () => {
    const a = analyzeSource(HARDCODED_SECRETS);
    assert.equal(a.literals.find((l) => l.value.startsWith("2c9180"))?.class, "id");
    assert.equal(a.literals.find((l) => l.value.startsWith("hunter2"))?.class, "secret");
  });

  it("leaves an ordinary string unclassified", () => {
    const a = analyzeSource(`String s = "displayName";`);
    assert.equal(a.literals[0].class, "string");
  });
});

describe("analyzeSource — null derefs", () => {
  it("flags an unguarded deref of a call result + records the originating call", () => {
    const a = analyzeSource(UNGUARDED_DEREF);
    assert.equal(a.nullDerefs.length, 1);
    assert.equal(a.nullDerefs[0].variable, "id");
    assert.equal(a.nullDerefs[0].originCall, "context.getObjectByName");
  });

  it("records non-ISC call origins too (analysis stays general; policy is the detector's)", () => {
    const a = analyzeSource(`Instant now = Instant.now();\nlong e = now.getEpochSecond();`);
    assert.equal(a.nullDerefs.length, 1);
    assert.equal(a.nullDerefs[0].originCall, "Instant.now");
  });

  it("does not flag a guarded deref", () => {
    const a = analyzeSource(GUARDED_DEREF);
    assert.equal(a.nullDerefs.length, 0);
  });

  it("clean fixture has no null derefs", () => {
    const a = analyzeSource(CLEAN_BUILD_MAP);
    assert.equal(a.nullDerefs.length, 0);
  });
});

describe("analyzeSource — locals + control flow", () => {
  it("detects an unused local and reachable terminator", () => {
    const a = analyzeSource(DEAD_CODE);
    const unused = a.locals.find((l) => l.name === "unusedLocal");
    assert.ok(unused);
    assert.equal(unused.references, 0);
    const used = a.locals.find((l) => l.name === "result");
    assert.ok(used && used.references > 0);
    assert.ok(a.controlFlow.terminators.some((t) => t.kind === "return"));
  });

  it("reports max depth and branch count", () => {
    const a = analyzeSource(CLEAN_BUILD_MAP);
    assert.ok(a.controlFlow.maxDepth >= 1);
    assert.equal(a.controlFlow.branches, 1); // the single `if`
  });
});

describe("analyzeSource — robustness", () => {
  it("handles empty source", () => {
    const a = analyzeSource("");
    assert.equal(a.tokens.length, 0);
    assert.equal(a.lineCount, 0);
    assert.equal(a.apiCalls.length, 0);
  });

  it("does not throw on malformed source", () => {
    assert.doesNotThrow(() => analyzeSource(`String s = "unterminated; if ( { @#`));
  });
});
