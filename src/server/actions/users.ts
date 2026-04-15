"use server";

import { headers } from "next/headers";
import { auth } from "~/server/better-auth";
import { db } from "~/server/db";

export type UserRole = "construction_manager" | "admin";

type UserDb = {
  user: {
    findMany: (args: {
      orderBy: { name: "asc" };
      select: {
        id: true;
        name: true;
        email: true;
        image: true;
        role: true;
        createdAt: true;
      };
    }) => Promise<
      Array<{
        id: string;
        name: string;
        email: string;
        image: string | null;
        role: string;
        createdAt: Date;
      }>
    >;
    findFirst: (args: {
      where: { name: string };
      select: { email: true };
    }) => Promise<{ email: string } | null>;
    count: () => Promise<number>;
    update: (args: {
      where: { id: string };
      data: { name?: string; email?: string; image?: string | null; role?: string };
    }) => Promise<{ id: string }>;
  };
};

const userDb = db as unknown as UserDb;

export async function findEmailByUsername(name: string): Promise<string | null> {
  const user = await userDb.user.findFirst({
    where: { name },
    select: { email: true },
  });
  return user?.email ?? null;
}

export async function listUsers() {
  return userDb.user.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      createdAt: true,
    },
  });
}

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  image?: string | null;
}) {
  const h = await headers();
  const userCount = await userDb.user.count();

  let userId: string;

  if (userCount === 0) {
    // Bootstrap: no admin exists yet — use public sign-up, then elevate role.
    const result = await auth.api.signUpEmail({
      body: { name: input.name, email: input.email, password: input.password },
      headers: h,
    });
    if (!result?.user?.id) throw new Error("Sign-up failed");
    userId = result.user.id;
  } else {
    // Normal path: requires caller to have admin session.
    const result = await auth.api.createUser({
      body: {
        name: input.name,
        email: input.email,
        password: input.password,
        // Better Auth plugin types are narrowed to "user"|"admin" but the runtime
        // supports arbitrary role strings configured via adminRole/defaultRole.
        role: input.role as "admin",
      },
      headers: h,
    });
    if (!result?.user?.id) throw new Error("Create user failed");
    userId = result.user.id;
  }

  // Set role + image via Prisma (admin plugin createUser may not carry image).
  await userDb.user.update({
    where: { id: userId },
    data: { role: input.role, image: input.image ?? null },
  });

  return { id: userId };
}

export async function updateUser(input: {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  image?: string | null;
}) {
  await userDb.user.update({
    where: { id: input.id },
    data: {
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      role: input.role,
      image: input.image ?? null,
    },
  });
  return { success: true };
}

export async function changePassword(input: { userId: string; newPassword: string }) {
  const h = await headers();
  await auth.api.setUserPassword({
    body: { userId: input.userId, newPassword: input.newPassword },
    headers: h,
  });
  return { success: true };
}

export async function deleteUser(userId: string) {
  const h = await headers();
  await auth.api.removeUser({
    body: { userId },
    headers: h,
  });
  return { success: true };
}
