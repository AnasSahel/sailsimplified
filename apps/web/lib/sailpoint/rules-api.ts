import "server-only";

import {
  getConnectorRule as pureGet,
  listConnectorRules as pureList,
} from "@simplified-identity/sailpoint-client";

import { getClientOptsForUser } from "./client";

export type {
  ConnectorRule,
  ConnectorRuleSignature,
  ConnectorRuleSignatureParam,
  ConnectorRuleSourceCode,
} from "@simplified-identity/sailpoint-client";

/**
 * Server-only wrapper around the pure `connector-rules` HTTP factory.
 * Resolves the DB-backed access token via `getClientOptsForUser(userId)`,
 * exactly like `transforms-api.ts`. Read-only — v1 ships no write actions.
 */

const NOT_CONNECTED = {
  ok: false as const,
  status: 0,
  message:
    "Not connected to SailPoint. Sign in again or check the tenant configuration.",
};

export async function listConnectorRules(userId: string) {
  const opts = await getClientOptsForUser(userId);
  if (!opts) return NOT_CONNECTED;
  return pureList(opts);
}

export async function getConnectorRule(userId: string, id: string) {
  const opts = await getClientOptsForUser(userId);
  if (!opts) return NOT_CONNECTED;
  return pureGet(opts, id);
}
