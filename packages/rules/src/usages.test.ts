/**
 * Unit tests for the source-attachment usages walker. Runner: Node's
 * built-in `node:test` + `node --experimental-strip-types` — zero deps.
 *
 *   node --experimental-strip-types --test src/usages.test.ts
 *
 * Fixtures are hand-built source payloads (no live tenant) shaped like the
 * relevant slices of `/v2025/sources/{id}`: the typed `beforeProvisioningRule`
 * slot (ref by id) and a connector-specific `connectorAttributes.nativeRules`
 * array (ref by id and by name).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  computeRuleUsages,
  computeUnresolvedRuleReferences,
  type SourceForUsages,
} from "./usages.ts";
import type { RuleLike } from "./types.ts";

const rules: RuleLike[] = [
  { id: "rule-buildmap", name: "AD BuildMap" },
  { id: "rule-beforeprov", name: "AD BeforeProvisioning" },
  { id: "rule-orphan", name: "Unused WebService Rule" },
];

const adSource: SourceForUsages = {
  id: "src-ad",
  name: "Active Directory",
  source: {
    id: "src-ad",
    name: "Active Directory",
    // Typed slot — reference by id (a `{ id, name, type }` ref object).
    beforeProvisioningRule: {
      id: "rule-beforeprov",
      name: "AD BeforeProvisioning",
      type: "RULE",
    },
    connectorAttributes: {
      // Connector bag — array of rule ids.
      nativeRules: ["rule-buildmap"],
    },
  },
};

const hrSource: SourceForUsages = {
  id: "src-hr",
  name: "Workday HR",
  source: {
    id: "src-hr",
    name: "Workday HR",
    connectorAttributes: {
      // Reference by NAME (heuristic match).
      buildMapRule: "AD BuildMap",
    },
  },
};

describe("computeRuleUsages", () => {
  it("returns an empty map when no source references any rule", () => {
    const map = computeRuleUsages(rules, [
      { id: "s", name: "S", source: { id: "s", name: "S" } },
    ]);
    assert.equal(map.size, 0);
  });

  it("attaches a rule referenced by id in a typed slot", () => {
    const map = computeRuleUsages(rules, [adSource]);
    const before = map.get("rule-beforeprov");
    assert.ok(before, "rule-beforeprov should be attached");
    assert.equal(before!.length, 1);
    assert.equal(before![0].sourceId, "src-ad");
    assert.equal(before![0].matchedBy, "id");
    // Trailing `.id` of the ref object is stripped → names the slot.
    assert.equal(before![0].attachmentPath, "beforeProvisioningRule");
  });

  it("attaches a rule referenced by id inside a connector bag array", () => {
    const map = computeRuleUsages(rules, [adSource]);
    const bm = map.get("rule-buildmap");
    assert.ok(bm);
    assert.equal(bm![0].matchedBy, "id");
    assert.equal(bm![0].attachmentPath, "connectorAttributes.nativeRules[0]");
  });

  it("attaches a rule referenced by name (heuristic)", () => {
    const map = computeRuleUsages(rules, [hrSource]);
    const bm = map.get("rule-buildmap");
    assert.ok(bm);
    assert.equal(bm![0].sourceId, "src-hr");
    assert.equal(bm![0].matchedBy, "name");
  });

  it("dedupes to one entry per (rule, source), preferring an id match", () => {
    // Same source references rule-buildmap both by id and by name.
    const dual: SourceForUsages = {
      id: "src-dual",
      name: "Dual",
      source: {
        id: "src-dual",
        name: "Dual",
        connectorAttributes: {
          nativeRules: ["rule-buildmap"],
          buildMapRule: "AD BuildMap",
        },
      },
    };
    const map = computeRuleUsages(rules, [dual]);
    const bm = map.get("rule-buildmap");
    assert.ok(bm);
    assert.equal(bm!.length, 1, "deduped to one entry");
    assert.equal(bm![0].matchedBy, "id", "id match wins over name match");
  });

  it("never attaches a rule that no source references (orphan)", () => {
    const map = computeRuleUsages(rules, [adSource, hrSource]);
    assert.equal(map.has("rule-orphan"), false);
  });
});

describe("computeUnresolvedRuleReferences", () => {
  it("flags a source slot pointing at a rule id that no longer exists", () => {
    const src: SourceForUsages = {
      id: "src-x",
      name: "Source X",
      source: {
        id: "src-x",
        name: "Source X",
        beforeProvisioningRule: { id: "rule-DELETED", name: "Gone", type: "RULE" },
      },
    };
    const unresolved = computeUnresolvedRuleReferences(rules, [src]);
    assert.equal(unresolved.length, 1);
    assert.equal(unresolved[0].reference, "rule-DELETED");
    assert.equal(unresolved[0].sourceId, "src-x");
    assert.equal(unresolved[0].attachmentPath, "beforeProvisioningRule");
  });

  it("does not flag a resolvable reference", () => {
    const unresolved = computeUnresolvedRuleReferences(rules, [adSource]);
    assert.equal(unresolved.length, 0);
  });

  it("ignores unknown strings that are not under a rule slot", () => {
    const src: SourceForUsages = {
      id: "src-y",
      name: "Source Y",
      source: {
        id: "src-y",
        name: "Source Y",
        description: "some-random-uuid-not-a-rule",
        connectorAttributes: { host: "ad.example.com" },
      },
    };
    const unresolved = computeUnresolvedRuleReferences(rules, [src]);
    assert.equal(unresolved.length, 0);
  });

  it("does not flag the label fields (name/type) of a valid ref object", () => {
    const unresolved = computeUnresolvedRuleReferences(rules, [adSource]);
    // adSource.beforeProvisioningRule.name === "AD BeforeProvisioning"
    // must not be reported as a unresolved reference.
    assert.equal(unresolved.length, 0);
  });
});
