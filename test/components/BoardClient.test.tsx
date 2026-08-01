import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BoardClient } from "~/components/board/BoardClient";
import { getWeekDateMap, toDateParam } from "~/lib/week";
import type { Assignment, Availability, BoardWeek, Employee, Project } from "~/types";

// ── Mocks ────────────────────────────────────────────────────────────────────
// BoardClient talks to the server exclusively through these "use server" action
// modules (never fetch/Prisma directly), so mocking them at the module boundary
// is enough to drive the component fully offline.

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
  useLocale: () => "en-GB",
}));

const routerRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh, push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/board",
}));

// Not under test here — Sidebar pulls in better-auth's session client, which
// would otherwise try to hit the network for every render.
vi.mock("~/components/Sidebar", () => ({
  Sidebar: () => null,
}));

const boardActions = vi.hoisted(() => ({
  updateAssignment: vi.fn().mockResolvedValue({ success: true }),
  splitAssignment: vi.fn().mockResolvedValue({ success: true }),
  mergeAssignment: vi.fn().mockResolvedValue({ success: true }),
  copyDayAssignments: vi.fn().mockResolvedValue({ success: true }),
  copyWeekAssignments: vi.fn().mockResolvedValue({ success: true }),
  setAvailability: vi.fn().mockResolvedValue({ success: true }),
  clearAvailability: vi.fn().mockResolvedValue({ success: true }),
  clearProjectAssignmentsForWeek: vi.fn().mockResolvedValue({ success: true }),
  setHoliday: vi.fn().mockResolvedValue({ success: true }),
  clearHoliday: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("~/server/actions/board", () => ({
  updateAssignment: boardActions.updateAssignment,
  splitAssignment: boardActions.splitAssignment,
  mergeAssignment: boardActions.mergeAssignment,
  copyDayAssignments: boardActions.copyDayAssignments,
  copyWeekAssignments: boardActions.copyWeekAssignments,
  setAvailability: boardActions.setAvailability,
  clearAvailability: boardActions.clearAvailability,
  clearProjectAssignmentsForWeek: boardActions.clearProjectAssignmentsForWeek,
  setHoliday: boardActions.setHoliday,
  clearHoliday: boardActions.clearHoliday,
}));

vi.mock("~/server/actions/sites", () => ({
  setSiteTransition: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("~/server/actions/preferences", () => ({
  saveThemePreference: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("~/server/actions/errors", () => ({
  reportClientError: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("~/server/actions/comments", () => ({
  listComments: vi.fn().mockResolvedValue([]),
  addComment: vi.fn(),
  deleteComment: vi.fn(),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

// Far enough in the future to never become a "past week" relative to the
// real system clock the test runs under — confirmPastEdit() would otherwise
// intercept every mutation below with a confirmation modal instead of
// running it immediately.
const WEEK_START = "2099-01-05T00:00:00.000Z"; // a Monday
const weekDates = getWeekDateMap(WEEK_START);

const selectedWeek: BoardWeek = {
  id: "week-1",
  startDateIso: WEEK_START,
  endDateIso: weekDates.Friday,
  param: toDateParam(WEEK_START),
  label: "5 - 9 Jan 99",
  isCurrent: true,
};

const employees: Employee[] = [
  { id: "e1", name: "Alice", img: null },
  { id: "e2", name: "Bob", img: null },
];

const projects: Project[] = [
  {
    id: "p1",
    name: "Site One",
    description: null,
    startDate: null,
    endDate: null,
    status: "active",
    constructionManagerId: null,
    constructionManagerName: null,
  },
];

const baseProps = {
  dbProjects: projects,
  dbEmployees: employees,
  dbAssignments: [] as Assignment[],
  dbAvailability: [] as Availability[],
  dbHolidays: [],
  dbCommentCounts: {},
  weekStatusMap: {},
  selectedWeek,
  weeks: [selectedWeek],
};

const poolCell = (day: string) => document.querySelector(`[data-rfd-droppable-id="pool-${day}"]`) as HTMLElement;
const projectCell = (projectId: string, day: string) =>
  document.querySelector(`[data-rfd-droppable-id="${projectId}-${day}"]`) as HTMLElement;
const halfCell = (projectId: string, day: string, half: "pre" | "post") =>
  document.querySelector(`[data-rfd-droppable-id="${projectId}-${day}-${half}"]`) as HTMLElement;

// Fly-out buttons are always in the DOM (visibility is CSS-only, via the
// `card-open` class, which isn't loaded here) — so a card's buttons must be
// scoped to that specific card's draggable wrapper. Employee names are also
// not unique documentwide: every unassigned employee appears in every day's
// pool column simultaneously (day-hiding is a CSS "hidden" class that isn't
// loaded here either), so name lookups must always be scoped to one cell.
const cardOf = (scope: HTMLElement, name: string) =>
  within(scope).getByText(name).closest("[data-rfd-draggable-id]") as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BoardClient", () => {
  it("puts unassigned employees in Monday's pool on initial load", () => {
    render(<BoardClient {...baseProps} />);

    const pool = within(poolCell("Monday"));
    expect(pool.getByText("Alice")).toBeInTheDocument();
    expect(pool.getByText("Bob")).toBeInTheDocument();
  });

  it("marking an employee sick removes them from the pool and persists the change", async () => {
    const user = userEvent.setup();
    render(<BoardClient {...baseProps} />);

    const monday = poolCell("Monday");
    await user.click(within(monday).getByText("Alice")); // opens the fly-out menu
    await user.click(within(cardOf(monday, "Alice")).getByTitle("markAsSick"));

    expect(within(poolCell("Monday")).queryByText("Alice")).not.toBeInTheDocument();
    expect(boardActions.setAvailability).toHaveBeenCalledWith("e1", weekDates.Monday, "week-1", "sick");
  });

  it("splitting then merging a full-day project assignment round-trips back to a single card", async () => {
    const dbAssignments: Assignment[] = [
      { employeeId: "e1", projectId: "p1", date: new Date(weekDates.Monday), weekId: "week-1", dayPart: "full_day" },
    ];
    const user = userEvent.setup();
    render(<BoardClient {...baseProps} dbAssignments={dbAssignments} />);

    const fullCell = projectCell("p1", "Monday");
    await user.click(within(fullCell).getByText("Alice"));
    await user.click(within(cardOf(fullCell, "Alice")).getByTitle("splitIntoHalfDays"));

    expect(boardActions.splitAssignment).toHaveBeenCalledWith("e1", "p1", weekDates.Monday, "week-1");
    // Two half-day cards now exist in the AM/PM columns instead of the full-day one.
    expect(within(projectCell("p1", "Monday")).queryByText("Alice")).not.toBeInTheDocument();
    const amCellEl = halfCell("p1", "Monday", "pre");
    const pmCellEl = halfCell("p1", "Monday", "post");
    expect(within(amCellEl).getByText("Alice")).toBeInTheDocument();
    expect(within(pmCellEl).getByText("Alice")).toBeInTheDocument();

    await user.click(within(amCellEl).getByText("Alice"));
    await user.click(within(cardOf(amCellEl, "Alice")).getByTitle("mergeToFullDay"));

    expect(boardActions.mergeAssignment).toHaveBeenCalledWith("e1", "p1", weekDates.Monday, "week-1");
    expect(within(projectCell("p1", "Monday")).getByText("Alice")).toBeInTheDocument();
  });

  it(
    "does not clobber optimistic state with a rebuild while a mutation is still in flight, " +
      "and catches up once the queue drains",
    async () => {
      // This pins the behavior the audit flags as the highest-risk part of BoardClient:
      // syncPendingRef/skippedRebuildRef exist specifically so a rebuild from stale
      // server props (e.g. new dbAssignments after router.refresh() elsewhere) doesn't
      // silently discard an edit that hasn't reached the DB yet.
      let resolveMutation!: () => void;
      boardActions.setAvailability.mockReturnValue(
        new Promise((resolve) => {
          resolveMutation = () => resolve({ success: true });
        }),
      );

      const user = userEvent.setup();
      const { rerender } = render(<BoardClient {...baseProps} />);

      const monday = poolCell("Monday");
      await user.click(within(monday).getByText("Alice"));
      await user.click(within(cardOf(monday, "Alice")).getByTitle("markAsSick"));
      expect(within(poolCell("Monday")).queryByText("Alice")).not.toBeInTheDocument();

      // Simulate fresh (but now-stale) server props arriving while the mutation
      // above is still unresolved — e.g. from another tab's edit landing via
      // router.refresh(). If the rebuild effect ran now, Alice would reappear in
      // the pool even though the sick-marking edit hasn't been dropped locally.
      rerender(
        <BoardClient
          {...baseProps}
          dbAssignments={[
            { employeeId: "e2", projectId: "p1", date: new Date(weekDates.Monday), weekId: "week-1", dayPart: "full_day" },
          ]}
        />,
      );
      expect(within(poolCell("Monday")).queryByText("Alice")).not.toBeInTheDocument();

      // Queue drains — the skipped rebuild should now be replayed via router.refresh().
      await act(async () => {
        resolveMutation();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(routerRefresh).toHaveBeenCalled();
    },
  );
});
