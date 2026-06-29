import { env } from "~/env";
import { PrismaClient } from "@prisma/client";
import { headers } from "next/headers";

type AuditDb = {
  auditLog: {
    create: (args: {
      data: { action: string; model: string; path: string | null; payload: object };
    }) => Promise<unknown>;
  };
};

const WRITE_OPS = new Set([
  "create", "update", "delete", "upsert",
  "createMany", "updateMany", "deleteMany",
]);

// Exclude noisy auth/internal tables from audit trail
const SKIP_MODELS = new Set(["AuditLog", "Session", "Account", "Verification"]);

const createPrismaClient = () =>
  new PrismaClient({
    log:
      env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

const prismaBase = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = prismaBase;

// Export unextended client for direct queries on models the extension doesn't cover yet
export { prismaBase as prismaRaw };

export const db = prismaBase.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const result = await query(args);

        if (WRITE_OPS.has(operation) && model && !SKIP_MODELS.has(model)) {
          let path: string | null = null;
          try {
            const h = await headers();
            path = h.get("referer");
          } catch {
            // outside request context (seed, migration, etc.)
          }

          void (prismaBase as unknown as AuditDb).auditLog.create({
            data: {
              action: operation,
              model,
              path,
              // JSON.parse(stringify) converts Date → ISO string, strips undefined
              payload: JSON.parse(JSON.stringify(args)) as object,
            },
          }).catch((err: unknown) => console.error("[audit] write failed:", err));
        }

        return result;
      },
    },
  },
});
