import { requireAdminPage } from "~/server/better-auth/roles";
import { listUsers } from "~/server/actions/users";
import { UsersClient } from "./UsersClient";

export default async function UsersPage() {
  await requireAdminPage();

  const users = await listUsers();
  return <UsersClient users={users} />;
}
