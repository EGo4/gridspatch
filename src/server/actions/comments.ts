"use server";

import { headers } from "next/headers";
import { auth } from "~/server/better-auth";
import { db } from "~/server/db";

export type EmployeeDayCommentDto = {
  id: string;
  text: string;
  authorId: string;
  authorName: string;
  createdAtIso: string;
  canDelete: boolean;
};

const getRequiredSession = async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) throw new Error("Not authenticated");
  return session;
};

export async function listComments(employeeId: string, dateIso: string): Promise<EmployeeDayCommentDto[]> {
  const session = await getRequiredSession();
  const date = new Date(dateIso);

  const comments = await db.employeeDayComment.findMany({
    where: { employeeId, date },
    include: { author: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  return comments.map((c) => ({
    id: c.id,
    text: c.text,
    authorId: c.authorId,
    authorName: c.author.name,
    createdAtIso: c.createdAt.toISOString(),
    canDelete: session.user.role === "admin" || c.authorId === session.user.id,
  }));
}

export async function addComment(
  employeeId: string,
  dateIso: string,
  text: string,
): Promise<EmployeeDayCommentDto> {
  const session = await getRequiredSession();
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Comment text is required");

  const created = await db.employeeDayComment.create({
    data: { employeeId, date: new Date(dateIso), authorId: session.user.id, text: trimmed },
    include: { author: { select: { name: true } } },
  });

  return {
    id: created.id,
    text: created.text,
    authorId: created.authorId,
    authorName: created.author.name,
    createdAtIso: created.createdAt.toISOString(),
    canDelete: true,
  };
}

export async function deleteComment(commentId: string): Promise<void> {
  const session = await getRequiredSession();

  const comment = await db.employeeDayComment.findUnique({ where: { id: commentId } });
  if (!comment) return;

  if (comment.authorId !== session.user.id && session.user.role !== "admin") {
    throw new Error("Not allowed to delete this comment");
  }

  await db.employeeDayComment.delete({ where: { id: commentId } });
}
