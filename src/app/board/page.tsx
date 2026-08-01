import { getLocale } from "next-intl/server";
import { BoardClient } from "~/components/board/BoardClient";
import { db } from "~/server/db";
import { getBoardPageData } from "~/server/services/board";

type BoardPageProps = {
  searchParams?: Promise<{
    week?: string | string[];
  }>;
};

export default async function BoardPage({ searchParams }: BoardPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const selectedWeekParam = Array.isArray(resolvedSearchParams?.week)
    ? resolvedSearchParams.week[0]
    : resolvedSearchParams?.week;
  const locale = await getLocale();
  const boardData = await getBoardPageData(db, selectedWeekParam, locale);

  return <BoardClient {...boardData} />;
}
