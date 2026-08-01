import { getLocale } from "next-intl/server";
import { BoardClient } from "~/components/board/BoardClient";
import { db } from "~/server/db";
import { getBoardPageData } from "~/server/services/board";
import { getActivityYears } from "~/server/services/activityYears";
import { requireSessionPage } from "~/server/better-auth/roles";

type BoardPageProps = {
  searchParams?: Promise<{
    week?: string | string[];
  }>;
};

export default async function BoardPage({ searchParams }: BoardPageProps) {
  await requireSessionPage();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const selectedWeekParam = Array.isArray(resolvedSearchParams?.week)
    ? resolvedSearchParams.week[0]
    : resolvedSearchParams?.week;
  const locale = await getLocale();
  const [boardData, activityYears] = await Promise.all([
    getBoardPageData(db, selectedWeekParam, locale),
    getActivityYears(db),
  ]);

  return <BoardClient {...boardData} years={activityYears.years} projectYears={activityYears.projectYears} />;
}
