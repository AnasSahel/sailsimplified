import { strict as assert } from "node:assert";
import { test } from "node:test";

import { getRuleCatalogEntry, humanizeRuleType } from "./catalog.ts";

test("displayLabel drops the connector prefix for lifecycle hooks", () => {
  assert.equal(
    getRuleCatalogEntry("WebServiceAfterOperationRule").displayLabel,
    "After Operation Rule",
  );
  assert.equal(
    getRuleCatalogEntry("ConnectorBeforeCreate").displayLabel,
    "Before Create",
  );
});

test("displayLabel keeps the connector family when it owns the name", () => {
  assert.equal(getRuleCatalogEntry("JDBCBuildMap").displayLabel, "JDBC Build Map");
  assert.equal(getRuleCatalogEntry("SapHrProvision").displayLabel, "SAP HR Provision");
});

test("uncatalogued types fall back to a humanised split (raw type preserved as label)", () => {
  const entry = getRuleCatalogEntry("FooBarBuildMap");
  assert.equal(entry.label, "FooBarBuildMap");
  assert.equal(entry.displayLabel, "Foo Bar Build Map");
});

test("humanizeRuleType keeps acronym runs glued", () => {
  assert.equal(humanizeRuleType("RACFPermissionCustomization"), "RACF Permission Customization");
  assert.equal(humanizeRuleType("JDBCProvision"), "JDBC Provision");
});
