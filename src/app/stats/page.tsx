import { db } from "~/server/db";
import { StatsClient } from "./StatsClient";
import { getStatsPageData, type StatsDb } from "~/server/services/statistics";

type SearchParams = { from?: string | string[]; to?: string | string[] };

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolved = await searchParams;
  const fromParam = Array.isArray(resolved.from) ? resolved.from[0] : resolved.from;
  const toParam = Array.isArray(resolved.to) ? resolved.to[0] : resolved.to;

  const data = await getStatsPageData(db as unknown as StatsDb, fromParam, toParam);
  return <StatsClient {...data} />;
}
