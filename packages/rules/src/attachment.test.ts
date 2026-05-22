import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  attachmentPathToPointer,
  buildAttachPatch,
  buildDetachPatch,
  listSourceEndpoints,
  ruleAttachmentSlot,
} from "./attachment.ts";

describe("ruleAttachmentSlot", () => {
  it("maps native provisioning rules to the nativeRules array", () => {
    assert.deepEqual(ruleAttachmentSlot("ConnectorAfterCreate"), { kind: "nativeRules" });
    assert.deepEqual(ruleAttachmentSlot("ConnectorBeforeDelete"), { kind: "nativeRules" });
  });
  it("maps BuildMap variants to the buildMapRule scalar", () => {
    assert.deepEqual(ruleAttachmentSlot("BuildMap"), { kind: "scalar", field: "buildMapRule" });
    assert.deepEqual(ruleAttachmentSlot("JDBCBuildMap"), { kind: "scalar", field: "buildMapRule" });
  });
  it("maps WebService rules to the connectionParameters before/after field", () => {
    assert.deepEqual(ruleAttachmentSlot("WebServiceAfterOperationRule"), {
      kind: "webservice",
      field: "afterRule",
    });
    assert.deepEqual(ruleAttachmentSlot("WebServiceBeforeOperationRule"), {
      kind: "webservice",
      field: "beforeRule",
    });
  });
  it("returns unsupported for undocumented types", () => {
    assert.deepEqual(ruleAttachmentSlot("ResourceObjectCustomization"), { kind: "unsupported" });
  });
});

describe("attachmentPathToPointer", () => {
  it("converts dotted+indexed walker paths to JSON Pointers", () => {
    assert.equal(
      attachmentPathToPointer("connectorAttributes.connectionParameters[1].afterRule"),
      "/connectorAttributes/connectionParameters/1/afterRule",
    );
    assert.equal(
      attachmentPathToPointer("connectorAttributes.nativeRules[0]"),
      "/connectorAttributes/nativeRules/0",
    );
    assert.equal(attachmentPathToPointer("connectorAttributes.buildMapRule"), "/connectorAttributes/buildMapRule");
    assert.equal(attachmentPathToPointer("beforeProvisioningRule"), "/beforeProvisioningRule");
  });
});

describe("buildDetachPatch", () => {
  it("removes the reference at its live path", () => {
    assert.deepEqual(buildDetachPatch("connectorAttributes.connectionParameters[1].afterRule"), [
      { op: "remove", path: "/connectorAttributes/connectionParameters/1/afterRule" },
    ]);
  });
});

describe("buildAttachPatch", () => {
  it("appends to an existing nativeRules array", () => {
    const r = buildAttachPatch({ kind: "nativeRules" }, "My Rule", { nativeRules: ["Other"] });
    assert.deepEqual(r, {
      ok: true,
      ops: [{ op: "add", path: "/connectorAttributes/nativeRules/-", value: "My Rule" }],
    });
  });
  it("creates the nativeRules array when absent", () => {
    const r = buildAttachPatch({ kind: "nativeRules" }, "My Rule", {});
    assert.deepEqual(r, {
      ok: true,
      ops: [{ op: "add", path: "/connectorAttributes/nativeRules", value: ["My Rule"] }],
    });
  });
  it("refuses a duplicate native attachment", () => {
    const r = buildAttachPatch({ kind: "nativeRules" }, "My Rule", { nativeRules: ["My Rule"] });
    assert.deepEqual(r, { ok: false, reason: "already-attached" });
  });
  it("replaces an existing scalar, adds when empty", () => {
    assert.deepEqual(buildAttachPatch({ kind: "scalar", field: "buildMapRule" }, "R", { buildMapRule: "Old" }), {
      ok: true,
      ops: [{ op: "replace", path: "/connectorAttributes/buildMapRule", value: "R" }],
    });
    assert.deepEqual(buildAttachPatch({ kind: "scalar", field: "buildMapRule" }, "R", {}), {
      ok: true,
      ops: [{ op: "add", path: "/connectorAttributes/buildMapRule", value: "R" }],
    });
  });
  it("requires an endpoint for WebService and validates the index", () => {
    assert.deepEqual(buildAttachPatch({ kind: "webservice", field: "afterRule" }, "R", {}), {
      ok: false,
      reason: "endpoint-required",
    });
    assert.deepEqual(
      buildAttachPatch({ kind: "webservice", field: "afterRule" }, "R", { connectionParameters: [{}] }, 5),
      { ok: false, reason: "invalid-endpoint" },
    );
    assert.deepEqual(
      buildAttachPatch({ kind: "webservice", field: "afterRule" }, "R", { connectionParameters: [{}, {}] }, 1),
      { ok: true, ops: [{ op: "add", path: "/connectorAttributes/connectionParameters/1/afterRule", value: "R" }] },
    );
  });
});

describe("listSourceEndpoints", () => {
  it("labels endpoints with a 1-based sequence number", () => {
    const eps = listSourceEndpoints({
      connectionParameters: [{ operationType: "Aggregate" }, { contextUrl: "/token" }],
    });
    assert.equal(eps.length, 2);
    assert.equal(eps[0].index, 0);
    assert.match(eps[0].label, /#1 · Aggregate/);
    assert.match(eps[1].label, /#2 · \/token/);
  });
});
