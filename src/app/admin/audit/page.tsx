import { prismaRaw } from "~/server/db";
import { AuditClient } from "./AuditClient";
import type { Prisma } from "@prisma/client";
import { requireAdminPage } from "~/server/better-auth/roles";

const PAGE_SIZE = 50;

export type AuditRow = {
  id: string;
  createdAt: string;
  action: string;
  model: string;
  path: string | null;
  payload: Prisma.JsonValue;
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdminPage();

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

  const [logs, total, distinctModels] = await Promise.all([
    prismaRaw.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, createdAt: true, action: true, model: true, path: true, payload: true },
    }),
    prismaRaw.auditLog.count({ where }),
    prismaRaw.auditLog.findMany({
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
