/**
 * Golden BeanShell samples for the analysis + source-lint test suites.
 *
 * Each fixture is a self-contained connector-rule script exercising one or
 * more facts `analyzeSource` must extract. They run without a live tenant —
 * the whole point of the analysis layer is that it's pure. Values here use
 * IANA-reserved example domains and invented ids only (public repo hygiene).
 *
 * Detector test suites (#361/#362) import these too, so a fixture is the
 * single source of truth for "what a deprecated call / API-in-loop / hardcoded
 * id looks like".
 */

/** Clean BuildMap rule — no findings expected. */
export const CLEAN_BUILD_MAP = `import sailpoint.object.Attributes;

Attributes attrs = new Attributes();
String first = (String) record.get("firstName");
String last = (String) record.get("lastName");
if (first != null && last != null) {
  attrs.put("displayName", first + " " + last);
}
return attrs;`;

/** Uses a deprecated ISC API call (`context.getObjectByName`) — correctness detector. */
export const DEPRECATED_API = `Identity id = context.getObjectByName(Identity.class, "jdoe");
return id.getName();`;

/** Result of a call is dereferenced with no null guard — null-safety detector. */
export const UNGUARDED_DEREF = `Identity id = context.getObjectByName(Identity.class, identityName);
String dn = id.getAttribute("distinguishedName");
return dn;`;

/** Same call, but guarded — null-safety detector must NOT flag it. */
export const GUARDED_DEREF = `Identity id = context.getObjectByName(Identity.class, identityName);
if (id != null) {
  return id.getAttribute("distinguishedName");
}
return null;`;

/** An API call inside a for-loop body — perf detector. */
export const API_IN_LOOP = `List names = (List) record.get("members");
for (int k = 0; k < names.size(); k++) {
  Identity m = context.getObjectByName(Identity.class, names.get(k));
  log.info(m.getName());
}
return names;`;

/** Hardcoded id + hardcoded secret — hygiene detector. Both locals are read so only the secrets detector fires. */
export const HARDCODED_SECRETS = `String sourceId = "2c9180857c8e5f9a017c8e6b1a2b0001";
String password = "hunter2-not-a-real-secret";
log.info("connecting to " + sourceId + " with " + password);
return sourceId;`;

/** Unreachable statement after a return, plus an unused local — dead-code detector. */
export const DEAD_CODE = `String result = "ok";
String unusedLocal = "never read";
return result;
log.info("this never runs");`;

export const ALL_FIXTURES = {
  CLEAN_BUILD_MAP,
  DEPRECATED_API,
  UNGUARDED_DEREF,
  GUARDED_DEREF,
  API_IN_LOOP,
  HARDCODED_SECRETS,
  DEAD_CODE,
} as const;
