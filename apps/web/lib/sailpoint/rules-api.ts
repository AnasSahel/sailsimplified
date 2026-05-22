import "server-only";

import {
  getConnectorRule as pureGet,
  listConnectorRules as pureList,
  createConnectorRule as pureCreate,
  updateConnectorRule as pureUpdate,
  deleteConnectorRule as pureDelete,
  validateConnectorRule as pureValidate,
  type ConnectorRulePayload,
  type ConnectorRuleSourceCode,
} from "@simplified-identity/sailpoint-client";

import { getClientOptsForUser } from "./client";

export type {
  ConnectorRule,
  ConnectorRuleSignature,
  ConnectorRuleSignatureParam,
  ConnectorRuleSourceCode,
  ConnectorRulePayload,
  CreateOrUpdateRuleResult,
  DeleteRuleResult,
  ValidateRuleResult,
  RuleValidationDetail,
} from "@simplified-identity/sailpoint-client";

/**
 * Server-only wrapper around the pure `connector-rules` HTTP factory.
 * Resolves the DB-backed access token via `getClientOptsForUser(userId)`,
 * exactly like `transforms-api.ts`. v2 (#350) adds the write surface:
 * create / update / delete + the server-side `validate` gate.
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

export async function createConnectorRule(
  userId: string,
  payload: ConnectorRulePayload,
) {
  const opts = await getClientOptsForUser(userId);
  if (!opts) return NOT_CONNECTED;
  return pureCreate(opts, payload);
}

export async function updateConnectorRule(
  userId: string,
  id: string,
  payload: ConnectorRulePayload,
) {
  const opts = await getClientOptsForUser(userId);
  if (!opts) return NOT_CONNECTED;
  return pureUpdate(opts, id, payload);
}

export async function deleteConnectorRule(userId: string, id: string) {
  const opts = await getClientOptsForUser(userId);
  if (!opts) return NOT_CONNECTED;
  return pureDelete(opts, id);
}

export async function validateConnectorRule(
  userId: string,
  sourceCode: ConnectorRuleSourceCode,
) {
  const opts = await getClientOptsForUser(userId);
  if (!opts) return NOT_CONNECTED;
  return pureValidate(opts, sourceCode);
}
