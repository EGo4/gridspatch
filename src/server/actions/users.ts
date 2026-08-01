"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { auth } from "~/server/better-auth";
import { db } from "~/server/db";
import { isAdmin, requireAdmin, type UserRole } from "~/server/better-auth/roles";
import { zEmail, zId, zName, zUserRole } from "~/server/validation";

const zPassword = z.string().min(8).max(200);

export async function findEmailByUsername(name: string): Promise<string | null> {
  const parsedName = zName.parse(name);
  const user = await db.user.findFirst({
    where: { name: parsedName },
    select: { email: true },
  });
  return user?.email ?? null;
}

export async function listUsers() {
  await requireAdmin();
  return db.user.findMany({
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

export async function listConstructionManagers(): Promise<Array<{ id: string; name: string }>> {
  const users = await db.user.findMany({
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
  return users
    .filter((u) => u.role === "construction_manager" || u.role === "admin")
    .map((u) => ({ id: u.id, name: u.name }));
}

const createUserSchema = z.object({
  name: zName,
  email: zEmail,
  password: zPassword,
  role: zUserRole,
  image: z.string().trim().max(2000).nullable().optional(),
});

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  image?: string | null;
}) {
  const parsedInput = createUserSchema.parse(input);
  input = parsedInput;
  const h = await headers();
  const userCount = await db.user.count();

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
  await db.user.update({
    where: { id: userId },
    data: { role: input.role, image: input.image ?? null },
  });

  return { id: userId };
}

const updateUserSchema = z.object({
  id: zId,
  name: zName,
  email: zEmail,
  role: zUserRole,
  image: z.string().trim().max(2000).nullable().optional(),
});

export async function updateUser(input: {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  image?: string | null;
}) {
  await requireAdmin();
  const parsed = updateUserSchema.parse(input);
  await db.user.update({
    where: { id: parsed.id },
    data: {
      name: parsed.name,
      email: parsed.email.toLowerCase(),
      role: parsed.role,
      image: parsed.image ?? null,
    },
  });
  return { success: true };
}

const resetPasswordSchema = z.object({
  userId: zId,
  newPassword: zPassword,
  adminPassword: z.string().min(1).max(200),
});

export async function resetUserPassword(input: {
  userId: string;
  newPassword: string;
  adminPassword: string;
}) {
  const parsed = resetPasswordSchema.parse(input);
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session?.user?.id) throw new Error("Not authenticated");

  const adminUser = session.user as { role?: string };
  if (!isAdmin(adminUser.role)) throw new Error("Admin access required");

  await auth.api.verifyPassword({
    body: { password: parsed.adminPassword },
    headers: h,
  });

  await auth.api.setUserPassword({
    body: { userId: parsed.userId, newPassword: parsed.newPassword },
    headers: h,
  });
  return { success: true };
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: zPassword,
});

export async function changeCurrentUserPassword(input: {
  currentPassword: string;
  newPassword: string;
}) {
  const parsed = changePasswordSchema.parse(input);
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session?.user?.id) throw new Error("Not authenticated");

  await auth.api.changePassword({
    body: {
      currentPassword: parsed.currentPassword,
      newPassword: parsed.newPassword,
    },
    headers: h,
  });
  return { success: true };
}

export async function deleteUser(userId: string) {
  const parsedUserId = zId.parse(userId);
  const h = await headers();
  await auth.api.removeUser({
    body: { userId: parsedUserId },
    headers: h,
  });
  return { success: true };
}

export async function getCurrentUser() {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session?.user?.id) return null;
  const u = session.user as {
    id: string;
    name: string;
    email: string;
    image?: string | null;
    role?: string;
  };
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    image: u.image ?? null,
    role: u.role ?? "construction_manager",
  };
}

const updateCurrentUserSchema = z.object({
  name: zName,
  email: zEmail,
  image: z.string().trim().max(2000).nullable().optional(),
});

export async function updateCurrentUser(input: {
  name: string;
  email: string;
  image?: string | null;
}) {
  const parsed = updateCurrentUserSchema.parse(input);
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session?.user?.id) throw new Error("Not authenticated");

  await db.user.update({
    where: { id: session.user.id },
    data: {
      name: parsed.name,
      email: parsed.email.toLowerCase(),
      image: parsed.image ?? null,
    },
  });
  return { success: true };
}
