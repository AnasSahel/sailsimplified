/**
 * Unit tests for `groupTransformsByType`. Five cases per the ADR
 * `vault/Projects/Simplified Identity/2026-05-14-transforms-list-grouping-by-type.md`:
 *   1. Empty input → empty array
 *   2. Single transform → 1 group with that type
 *   3. Multiple transforms of the same type → 1 group, input order preserved
 *   4. Multiple types → groups sorted alphabetically by type
 *   5. Missing/empty `type` → bucketed in "unknown", rendered last
 *
 * Runner: Node's built-in `node:test` + `node --experimental-strip-types`
 * (Node 22+) — zero dependency, no test framework setup required.
 *
 * Run from the package dir:
 *   node --experimental-strip-types --test src/grouping.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  groupTransformsByType,
  UNKNOWN_TYPE,
  type GroupableTransform,
} from "./grouping.ts";

const t = (id: string, type?: string): GroupableTransform => ({ id, type });

describe("groupTransformsByType", () => {
  it("returns an empty array for an empty input", () => {
    const groups = groupTransformsByType([]);
    assert.deepEqual(groups, []);
  });

  it("returns one group with the type for a single transform", () => {
    const groups = groupTransformsByType([t("1", "lookup")]);

    assert.equal(groups.length, 1);
    assert.equal(groups[0].type, "lookup");
    assert.equal(groups[0].count, 1);
    assert.deepEqual(
      groups[0].transforms.map((x) => x.id),
      ["1"],
    );
  });

  it("buckets all transforms of the same type into one group, input order preserved", () => {
    const input = [
      t("1", "lookup"),
      t("2", "lookup"),
      t("3", "lookup"),
    ];
    const groups = groupTransformsByType(input);

    assert.equal(groups.length, 1);
    assert.equal(groups[0].type, "lookup");
    assert.equal(groups[0].count, 3);
    assert.deepEqual(
      groups[0].transforms.map((x) => x.id),
      ["1", "2", "3"],
    );
  });

  it("returns groups sorted alphabetically by type when multiple types are present", () => {
    const input = [
      t("1", "lookup"),
      t("2", "concat"),
      t("3", "displayName"),
      t("4", "lookup"),
      t("5", "concat"),
    ];
    const groups = groupTransformsByType(input);

    assert.deepEqual(
      groups.map((g) => g.type),
      ["concat", "displayName", "lookup"],
    );
    assert.deepEqual(
      groups.map((g) => g.count),
      [2, 1, 2],
    );
    // Intra-group input order preserved (`concat`: id 2 before id 5).
    assert.deepEqual(
      groups[0].transforms.map((x) => x.id),
      ["2", "5"],
    );
    assert.deepEqual(
      groups[2].transforms.map((x) => x.id),
      ["1", "4"],
    );
  });

  it("buckets transforms with missing or empty type into 'unknown', rendered last", () => {
    const input = [
      t("1", "lookup"),
      t("2"), // undefined
      t("3", "concat"),
      t("4", ""), // empty string
    ];
    const groups = groupTransformsByType(input);

    assert.equal(groups.length, 3);
    assert.deepEqual(
      groups.map((g) => g.type),
      ["concat", "lookup", UNKNOWN_TYPE],
    );
    const unknown = groups[groups.length - 1];
    assert.equal(unknown.type, UNKNOWN_TYPE);
    assert.equal(unknown.count, 2);
    assert.deepEqual(
      unknown.transforms.map((x) => x.id),
      ["2", "4"],
    );
  });
});
