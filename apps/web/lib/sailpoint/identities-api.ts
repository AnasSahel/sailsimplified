import "server-only";

import {
  countIdentities as pureCount,
  getIdentity as pureGet,
  getIdentityAccess as pureGetAccess,
  getIdentityAccounts as pureGetAccounts,
  getIdentityProfileLifecycleStates as pureGetProfileLcs,
  listIdentities as pureList,
  listIdentityProfiles as pureListProfiles,
  processIdentities as pureProcessBulk,
  processIdentity as pureProcess,
  searchIdentities as pureSearch,
  searchPublicIdentities as pureSearchPublic,
  type ListIdentitiesParams,
  type SearchIdentitiesParams,
  type SearchPublicIdentitiesParams,
} from "@simplified-identity/sailpoint-client";

import { getClientOptsForUser } from "./client";

export type {
  IdentityAccessItem,
  IdentityAccessItemType,
  IdentityAccount,
  IdentityDetail,
  IdentityLifecycleState,
  IdentityManagerRef,
  IdentityProfileLifecycleState,
  IdentityProfileRef,
  IdentityProfileSummary,
  IdentitySearchHit,
  IdentitySummary,
  ListIdentitiesParams,
  ListResult,
  ProcessIdentityResult,
  PublicIdentitySummary,
  SearchIdentitiesParams,
  SearchPublicIdentitiesParams,
} from "@simplified-identity/sailpoint-client";

const NOT_CONNECTED = {
  ok: false as const,
  status: 0,
  message:
    "Not connected to SailPoint. Sign in again or check the tenant configuration.",
};

export async function listIdentities(
  userId: string,
  params: ListIdentitiesParams = {},
) {
  const opts = await getClientOptsForUser(userId);
  if (!opts) return NOT_CONNECTED;
  return pureList(opts, params);
}

export async function searchIdentities(
  userId: string,
  params: SearchIdentitiesParams = {},
) {
  const opts = await getClientOptsForUser(userId);
  if (!opts) return NOT_CONNECTED;
  return pureSearch(opts, params);
}

export async function searchPublicIdentities(
  userId: string,
  params: SearchPublicIdentitiesParams,
) {
  const opts = await getClientOptsForUser(userId);
  if (!opts) return NOT_CONNECTED;
  return pureSearchPublic(opts, params);
}

export async function countIdentities(
  userId: string,
  params: SearchIdentitiesParams = {},
): Promise<number | undefined> {
  const opts = await getClientOptsForUser(userId);
  if (!opts) return undefined;
  return pureCount(opts, params);
}

export async function getIdentity(userId: string, id: string) {
  const opts = await getClientOptsForUser(userId);
  if (!opts) return NOT_CONNECTED;
  return pureGet(opts, id);
}

export async function getIdentityAccounts(userId: string, id: string) {
  const opts = await getClientOptsForUser(userId);
  if (!opts) return NOT_CONNECTED;
  return pureGetAccounts(opts, id);
}

export async function getIdentityAccess(userId: string, id: string) {
  const opts = await getClientOptsForUser(userId);
  if (!opts) return NOT_CONNECTED;
  return pureGetAccess(opts, id);
}

export async function processIdentity(userId: string, id: string) {
  const opts = await getClientOptsForUser(userId);
  if (!opts) return NOT_CONNECTED;
  return pureProcess(opts, id);
}

export async function processIdentities(userId: string, ids: string[]) {
  const opts = await getClientOptsForUser(userId);
  if (!opts) return NOT_CONNECTED;
  return pureProcessBulk(opts, ids);
}

export async function listIdentityProfiles(userId: string) {
  const opts = await getClientOptsForUser(userId);
  if (!opts) return NOT_CONNECTED;
  return pureListProfiles(opts);
}

export async function getIdentityProfileLifecycleStates(
  userId: string,
  profileId: string,
) {
  const opts = await getClientOptsForUser(userId);
  if (!opts) return NOT_CONNECTED;
  return pureGetProfileLcs(opts, profileId);
}
