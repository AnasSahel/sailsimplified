import "server-only";

import { and, asc, eq, gt, isNull, isNotNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { db } from "@/lib/db";
import { contractor, member, user } from "@/lib/db/schema";

import {
  type ContractorRow,
  type ContractorStatus,
  type OrgMember,
} from "./schemas";

const PAGE_SIZE = 25;

const sponsorUser = alias(user, "sponsor_user");

function computeStatus(endDate: string, deletedAt: Date | null): ContractorStatus {
  if (deletedAt) return "terminated";
  const today = new Date().toISOString().slice(0, 10);
  return endDate >= today ? "active" : "expired";
}

type RawRow = typeof contractor.$inferSelect & { sponsorName: string | null };

function toRow(c: RawRow): ContractorRow {
  return {
    id: c.id,
    organizationId: c.organizationId,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    startDate: c.startDate,
    endDate: c.endDate,
    sponsorUserId: c.sponsorUserId,
    sponsorName: c.sponsorName,
    externalRef: c.externalRef,
    attributes: c.attributes,
    status: computeStatus(c.endDate, c.deletedAt),
    deletedAt: c.deletedAt,
    createdBy: c.createdBy,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export type ListContractorsResult = {
  rows: ContractorRow[];
  nextCursor: string | null;
};

export type ListContractorsOptions = {
  status?: ContractorStatus | null;
  sponsorUserId?: string | null;
  q?: string | null;
  cursor?: string | null;
  limit?: number;
};

function encodeCursor(endDate: string, id: string): string {
  return Buffer.from(JSON.stringify({ endDate, id })).toString("base64url");
}

function decodeCursor(cursor: string): { endDate: string; id: string } | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf-8"),
    ) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "endDate" in parsed &&
      "id" in parsed &&
      typeof (parsed as Record<string, unknown>).endDate === "string" &&
      typeof (parsed as Record<string, unknown>).id === "string"
    ) {
      return parsed as { endDate: string; id: string };
    }
    return null;
  } catch {
    return null;
  }
}

const BASE_SELECT = {
  id: contractor.id,
  organizationId: contractor.organizationId,
  firstName: contractor.firstName,
  lastName: contractor.lastName,
  email: contractor.email,
  startDate: contractor.startDate,
  endDate: contractor.endDate,
  sponsorUserId: contractor.sponsorUserId,
  sponsorName: sponsorUser.name,
  externalRef: contractor.externalRef,
  attributes: contractor.attributes,
  deletedAt: contractor.deletedAt,
  createdBy: contractor.createdBy,
  createdAt: contractor.createdAt,
  updatedAt: contractor.updatedAt,
} as const;

export async function listContractors(
  orgId: string,
  options: ListContractorsOptions = {},
): Promise<ListContractorsResult> {
  const limit = options.limit ?? PAGE_SIZE;
  const today = new Date().toISOString().slice(0, 10);
  const cursor = options.cursor ? decodeCursor(options.cursor) : null;

  const conditions = [eq(contractor.organizationId, orgId)];

  if (options.status === "active") {
    conditions.push(isNull(contractor.deletedAt));
    conditions.push(sql`${contractor.endDate} >= ${today}`);
  } else if (options.status === "expired") {
    conditions.push(isNull(contractor.deletedAt));
    conditions.push(sql`${contractor.endDate} < ${today}`);
  } else if (options.status === "terminated") {
    conditions.push(isNotNull(contractor.deletedAt));
  } else {
    conditions.push(isNull(contractor.deletedAt));
  }

  if (options.sponsorUserId) {
    conditions.push(eq(contractor.sponsorUserId, options.sponsorUserId));
  }

  if (options.q) {
    const like = `%${options.q.toLowerCase()}%`;
    conditions.push(
      or(
        sql`lower(${contractor.firstName} || ' ' || ${contractor.lastName}) LIKE ${like}`,
        sql`lower(${contractor.email}) LIKE ${like}`,
      )!,
    );
  }

  if (cursor) {
    conditions.push(
      or(
        gt(contractor.endDate, cursor.endDate),
        and(
          eq(contractor.endDate, cursor.endDate),
          gt(contractor.id, cursor.id),
        ),
      )!,
    );
  }

  const rows = await db
    .select(BASE_SELECT)
    .from(contractor)
    .leftJoin(sponsorUser, eq(contractor.sponsorUserId, sponsorUser.id))
    .where(and(...conditions))
    .orderBy(asc(contractor.endDate), asc(contractor.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;

  const nextCursor =
    hasMore && data.length > 0
      ? encodeCursor(data[data.length - 1].endDate, data[data.length - 1].id)
      : null;

  return {
    rows: data.map(toRow),
    nextCursor,
  };
}

export async function getContractor(
  orgId: string,
  id: string,
): Promise<ContractorRow | null> {
  const rows = await db
    .select(BASE_SELECT)
    .from(contractor)
    .leftJoin(sponsorUser, eq(contractor.sponsorUserId, sponsorUser.id))
    .where(and(eq(contractor.organizationId, orgId), eq(contractor.id, id)))
    .limit(1);

  return rows[0] ? toRow(rows[0]) : null;
}

export type CreateContractorData = {
  id: string;
  orgId: string;
  createdBy: string;
  firstName: string;
  lastName: string;
  email: string;
  startDate: string;
  endDate: string;
  sponsorUserId: string;
  externalRef?: string | null;
  attributes?: string | null;
};

export async function createContractor(
  data: CreateContractorData,
): Promise<ContractorRow> {
  await db.insert(contractor).values({
    id: data.id,
    organizationId: data.orgId,
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    startDate: data.startDate,
    endDate: data.endDate,
    sponsorUserId: data.sponsorUserId,
    externalRef: data.externalRef ?? null,
    attributes: data.attributes ?? null,
    createdBy: data.createdBy,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const row = await getContractor(data.orgId, data.id);
  if (!row) throw new Error("Contractor not found after insert");
  return row;
}

export type UpdateContractorData = Partial<{
  firstName: string;
  lastName: string;
  email: string;
  startDate: string;
  endDate: string;
  sponsorUserId: string;
  externalRef: string | null;
  attributes: string | null;
  deletedAt: Date | null;
}>;

export async function updateContractor(
  orgId: string,
  id: string,
  data: UpdateContractorData,
): Promise<ContractorRow | null> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (data.firstName !== undefined) set.firstName = data.firstName;
  if (data.lastName !== undefined) set.lastName = data.lastName;
  if (data.email !== undefined) set.email = data.email;
  if (data.startDate !== undefined) set.startDate = data.startDate;
  if (data.endDate !== undefined) set.endDate = data.endDate;
  if (data.sponsorUserId !== undefined) set.sponsorUserId = data.sponsorUserId;
  if (data.externalRef !== undefined) set.externalRef = data.externalRef;
  if (data.attributes !== undefined) set.attributes = data.attributes;
  if ("deletedAt" in data) set.deletedAt = data.deletedAt;

  await db
    .update(contractor)
    .set(set)
    .where(and(eq(contractor.organizationId, orgId), eq(contractor.id, id)));

  return getContractor(orgId, id);
}

export async function softDeleteContractor(
  orgId: string,
  id: string,
): Promise<void> {
  await db
    .update(contractor)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(contractor.organizationId, orgId), eq(contractor.id, id)));
}

export async function listOrgMembers(orgId: string): Promise<OrgMember[]> {
  const rows = await db
    .select({
      userId: member.userId,
      name: user.name,
      email: user.email,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, orgId))
    .orderBy(asc(user.name));

  return rows;
}
