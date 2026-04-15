import { redirect } from "next/navigation";
import { getSession } from "~/server/better-auth/server";
import { listUsers } from "~/server/actions/users";
import { UsersClient } from "./UsersClient";

export default async function UsersPage() {
  const session = await getSession();
  if (session?.user?.role !== "admin") redirect("/board");

  const users = await listUsers();
  return <UsersClient users={users} />;
}
