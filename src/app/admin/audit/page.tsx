import { prismaRaw } from "~/server/db";
import { AuditClient } from "./AuditClient";
import type { Prisma } from "@prisma/client";

const PAGE_SIZE = 50;

export type AuditRow = {
  id: string;
  createdAt: string;
  action: string;
  model: string;
  path: string | null;
  payload: Prisma.JsonValue;
};

// Prisma client cast helpers — AuditLog model added post-migration
type RawAuditLog = {
  id: string;
  createdAt: Date;
  action: string;
  model: string;
  path: string | null;
  payload: Prisma.JsonValue;
};

type AuditDb = {
  auditLog: {
    findMany: (args: object) => Promise<RawAuditLog[]>;
    count: (args: object) => Promise<number>;
  };
};

type AuditDistinctDb = {
  auditLog: {
    findMany: (args: object) => Promise<{ model: string }[]>;
  };
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const model = params.model ?? "";
  const action = params.action ?? "";
  const from = params.from ?? "";
  const to = params.to ?? "";
  const page = parseInt(params.page ?? "0", 10);

  const where = {
    ...(model && { model }),
    ...(action && { action }),
    ...((from || to) && {
      createdAt: {
        ...(from && { gte: new Date(from) }),
        ...(to && { lte: new Date(to + "T23:59:59.999Z") }),
      },
    }),
  };

  const auditDb = prismaRaw as unknown as AuditDb;
  const auditDistinct = prismaRaw as unknown as AuditDistinctDb;

  const [logs, total, distinctModels] = await Promise.all([
    auditDb.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, createdAt: true, action: true, model: true, path: true, payload: true },
    }),
    auditDb.auditLog.count({ where }),
    auditDistinct.auditLog.findMany({
      select: { model: true },
      distinct: ["model"],
      orderBy: { model: "asc" },
    }),
  ]);

  return (
    <AuditClient
      logs={logs.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() }))}
      total={total}
      models={distinctModels.map((m) => m.model)}
      filters={{ model, action, from, to, page }}
      pageSize={PAGE_SIZE}
    />
  );
}
