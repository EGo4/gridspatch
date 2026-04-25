/**
 * One-time bootstrap: creates the first admin user directly in the database.
 * Run with: npx tsx scripts/create-admin.ts <name> <email> <password>
 *
 * Safe to run only when no users exist — exits early if any account is found.
 */
import { hashPassword } from "@better-auth/utils/password";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const [, , name, email, password] = process.argv;

if (!name || !email || !password) {
  console.error("Usage: npx tsx scripts/create-admin.ts <name> <email> <password>");
  process.exit(1);
}

const existingCount = await (db as unknown as { user: { count: () => Promise<number> } }).user.count();
if (existingCount > 0) {
  console.error("Users already exist. Create additional users from the admin panel.");
  process.exit(1);
}

const userDb = db as unknown as {
  user: {
    create: (args: {
      data: { name: string; email: string; emailVerified: boolean; role: string };
    }) => Promise<{ id: string }>;
  };
  account: {
    create: (args: {
      data: {
        accountId: string;
        providerId: string;
        userId: string;
        password: string;
      };
    }) => Promise<unknown>;
  };
};

const hashed = await hashPassword(password);
const user = await userDb.user.create({
  data: { name, email, emailVerified: true, role: "admin" },
});
await userDb.account.create({
  data: { accountId: user.id, providerId: "credential", userId: user.id, password: hashed },
});

console.log(`Admin account created: ${email}`);
await db.$disconnect();
