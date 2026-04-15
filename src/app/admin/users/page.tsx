import { listUsers } from "~/server/actions/users";
import { UsersClient } from "./UsersClient";

export default async function UsersPage() {
  const users = await listUsers();
  return <UsersClient users={users} />;
}
