/**
 * Tests for the connector-rules lint engine + the `unattached-rule`
 * detector + unresolved-reference passthrough.
 *
 *   node --experimental-strip-types --test src/lint/lint.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runRuleLint } from "./engine.ts";
import { unattachedRule } from "./rules/unattached-rule.ts";
import type { LintableRule, RuleLintContext } from "./types.ts";
import type { UnresolvedRuleReference, RuleUsageEntry } from "../usages.ts";

const rules: LintableRule[] = [
  { id: "rule-attached", name: "Attached", type: "BuildMap" },
  { id: "rule-orphan", name: "Orphan", type: "WebServiceBeforeOperationRule" },
];

function ctx(over: Partial<RuleLintContext> = {}): RuleLintContext {
  const usages = new Map<string, RuleUsageEntry[]>([
    [
      "rule-attached",
      [
        {
          sourceId: "src-ad",
          sourceName: "Active Directory",
          attachmentPath: "beforeProvisioningRule",
          matchedBy: "id",
        },
      ],
    ],
  ]);
  return {
    rules,
    usages,
    unresolvedReferences: [],
    now: new Date("2026-05-22T00:00:00Z"),
    ...over,
  };
}

describe("unattached-rule detector", () => {
  it("flags a rule with zero attached sources", () => {
    const issues = unattachedRule.check(rules[1], ctx());
    assert.equal(issues.length, 1);
    assert.equal(issues[0].ruleId, "rule-orphan");
    assert.equal(issues[0].severity, "warning");
  });

  it("does not flag a rule attached to ≥1 source", () => {
    const issues = unattachedRule.check(rules[0], ctx());
    assert.equal(issues.length, 0);
  });
});

describe("runRuleLint", () => {
  it("aggregates warnings and indexes them by rule id", () => {
    const result = runRuleLint(ctx());
    assert.equal(result.warnings.length, 1);
    assert.equal(result.errors.length, 0);
    assert.ok(result.byRuleId.has("rule-orphan"));
    assert.equal(result.byRuleId.has("rule-attached"), false);
  });

  it("passes unresolved references through structured (tenant-level, no rule subject)", () => {
    const unresolved: UnresolvedRuleReference[] = [
      {
        sourceId: "src-x",
        sourceName: "Source X",
        reference: "rule-DELETED",
        attachmentPath: "beforeProvisioningRule",
      },
    ];
    const result = runRuleLint(ctx({ unresolvedReferences: unresolved }));
    assert.equal(result.unresolvedReferences.length, 1);
    assert.equal(result.unresolvedReferences[0].reference, "rule-DELETED");
  });
});
