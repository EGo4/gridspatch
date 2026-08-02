/**
 * One-off migration: maps existing free-text Employee.role values onto the
 * known role key list (src/lib/roles.ts), case-insensitively. Unmapped
 * values are set to null and printed below so nothing is silently lost.
 *
 * Run with: npx tsx scripts/normalize-employee-roles.ts
 */
import { PrismaClient } from "@prisma/client";
import { normalizeRoleFreeText } from "../src/lib/roles.ts";

const db = new PrismaClient();

const employees = await db.employee.findMany({
  where: { role: { not: null } },
  select: { id: true, name: true, role: true },
});

let mapped = 0;
const unmapped: { name: string; role: string }[] = [];

for (const employee of employees) {
  const key = normalizeRoleFreeText(employee.role);
  if (key === employee.role) continue; // already a valid key, nothing to do
  await db.employee.update({ where: { id: employee.id }, data: { role: key } });
  if (key) {
    mapped++;
  } else {
    unmapped.push({ name: employee.name, role: employee.role! });
  }
}

console.log(`Mapped ${mapped} employee role(s) onto known keys.`);
if (unmapped.length > 0) {
  console.log(`Set ${unmapped.length} unmapped role(s) to null:`);
  for (const u of unmapped) console.log(`  - ${u.name}: "${u.role}"`);
}

await db.$disconnect();
