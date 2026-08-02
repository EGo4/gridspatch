import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BoardClient } from "~/components/board/BoardClient";
import { getWeekDateMap, toDateParam } from "~/lib/week";
import { DAYS } from "~/lib/constants";
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
  copyDayAssignments: vi.fn().mockResolvedValue({ success: true, skipped: 0 }),
  copySiteDayAssignments: vi.fn().mockResolvedValue({ success: true, skipped: 0 }),
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
  copySiteDayAssignments: boardActions.copySiteDayAssignments,
  copyWeekAssignments: boardActions.copyWeekAssignments,
  setAvailability: boardActions.setAvailability,
  clearAvailability: boardActions.clearAvailability,
  clearProjectAssignmentsForWeek: boardActions.clearProjectAssignmentsForWeek,
  setHoliday: boardActions.setHoliday,
  clearHoliday: boardActions.clearHoliday,
}));

const siteActions = vi.hoisted(() => ({
  setSiteTransition: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("~/server/actions/sites", () => ({
  setSiteTransition: siteActions.setSiteTransition,
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
  { id: "e1", name: "Alice", img: null, role: null },
  { id: "e2", name: "Bob", img: null, role: null },
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
  years: [] as number[],
  projectYears: {} as Record<string, number[]>,
};

const poolCell = (day: string) => document.querySelector(`[data-rfd-droppable-id="pool-${day}"]`) as HTMLElement;
const poolHalfCell = (day: string) => document.querySelector(`[data-rfd-droppable-id="pool-${day}-half"]`) as HTMLElement;
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

// Mirrors the next-intl mock above: title/text built from t(key, params).
const tp = (key: string, params: Record<string, unknown>) => `${key}:${JSON.stringify(params)}`;

// The holiday gear button's title has no per-day param, so all five (one per
// day) are identical strings — disambiguate by DOM order, which follows
// DAYS.map's fixed Monday..Friday order.
const holidayGearButton = (day: (typeof DAYS)[number]) => {
  const buttons = document.querySelectorAll('[title="holidaySettings"]');
  return buttons[DAYS.indexOf(day)] as HTMLElement;
};

// The mobile day-selector pill also renders the active day's name as a
// button ("Monday" by default), so source-day picks in the copy popover
// must be scoped to the popover itself, not queried document-wide.
const copyFromPopover = () => within(document.body).getByText("copyFrom").parentElement as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
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
    expect(boardActions.setAvailability).toHaveBeenCalledWith("e1", weekDates.Monday, "week-1", "sick", "full_day");
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

  it("keeps both halves when marked with different statuses (no false collapse)", async () => {
    const dbAssignments: Assignment[] = [
      { employeeId: "e1", projectId: "p1", date: new Date(weekDates.Monday), weekId: "week-1", dayPart: "full_day" },
    ];
    const user = userEvent.setup();
    render(<BoardClient {...baseProps} dbAssignments={dbAssignments} />);

    const fullCell = projectCell("p1", "Monday");
    await user.click(within(fullCell).getByText("Alice"));
    await user.click(within(cardOf(fullCell, "Alice")).getByTitle("splitIntoHalfDays"));

    const amCellEl = halfCell("p1", "Monday", "pre");
    const pmCellEl = halfCell("p1", "Monday", "post");

    await user.click(within(amCellEl).getByText("Alice"));
    await user.click(within(cardOf(amCellEl, "Alice")).getByTitle("markAsSick"));

    // The PM half must survive marking the AM half — it wasn't touched, and
    // the two statuses differ so there's no collapse into a full_day record.
    await user.click(within(pmCellEl).getByText("Alice"));
    await user.click(within(cardOf(pmCellEl, "Alice")).getByTitle("markAsVacation"));

    expect(boardActions.setAvailability).toHaveBeenNthCalledWith(1, "e1", weekDates.Monday, "week-1", "sick", "pre_lunch");
    expect(boardActions.setAvailability).toHaveBeenNthCalledWith(2, "e1", weekDates.Monday, "week-1", "vacation", "after_lunch");

    // Expand the swimlane and confirm both chips are there — this is the
    // actual regression check: local availability state used to get wiped
    // for the first half when the second half was marked, even though the
    // two statuses differ and shouldn't collapse into one full_day record.
    await user.click(within(document.body).getByText("sickVacation"));
    expect(within(document.body).getAllByTitle("clickToRemoveStatus")).toHaveLength(2);
  });

  it("clearing both halves of a swimlane absence one at a time merges them into one full-day pool card", async () => {
    const dbAssignments: Assignment[] = [
      { employeeId: "e1", projectId: "p1", date: new Date(weekDates.Monday), weekId: "week-1", dayPart: "full_day" },
    ];
    const user = userEvent.setup();
    render(<BoardClient {...baseProps} dbAssignments={dbAssignments} />);

    const fullCell = projectCell("p1", "Monday");
    await user.click(within(fullCell).getByText("Alice"));
    await user.click(within(cardOf(fullCell, "Alice")).getByTitle("splitIntoHalfDays"));

    const amCellEl = halfCell("p1", "Monday", "pre");
    const pmCellEl = halfCell("p1", "Monday", "post");

    await user.click(within(amCellEl).getByText("Alice"));
    await user.click(within(cardOf(amCellEl, "Alice")).getByTitle("markAsSick"));
    await user.click(within(pmCellEl).getByText("Alice"));
    await user.click(within(cardOf(pmCellEl, "Alice")).getByTitle("markAsVacation"));

    await user.click(within(document.body).getByText("sickVacation"));

    // Clear the first chip — that half alone goes to the half-day pool bucket.
    await user.click(within(document.body).getAllByTitle("clickToRemoveStatus")[0]!);
    expect(within(poolHalfCell("Monday")).getByText("Alice")).toBeInTheDocument();
    expect(within(poolCell("Monday")).queryByText("Alice")).not.toBeInTheDocument();

    // Clear the remaining chip — this is the regression check: it must merge
    // with the half already sitting in the pool into a single full-day card,
    // not stack a second half card next to it under a colliding React key.
    await user.click(within(document.body).getByTitle("clickToRemoveStatus"));
    expect(within(poolCell("Monday")).getByText("Alice")).toBeInTheDocument();
    expect(within(poolHalfCell("Monday")).queryByText("Alice")).not.toBeInTheDocument();
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

  it(
    "reorders cards within the same cell via the keyboard drag sensor " +
      "(cross-list drag-and-drop is not covered — see note below)",
    async () => {
      // @hello-pangea/dnd's keyboard sensor (Space to lift, arrow keys to move,
      // Space to drop) works here for same-list reordering, which needs no real
      // layout. Moving a card BETWEEN droppables (the actual "assign via drag"
      // feature) does not: the library picks the target droppable using real
      // getBoundingClientRect measurements, which jsdom always reports as
      // zero-sized, so cross-list movement silently does nothing in this
      // environment. That gap needs either per-droppable rect mocking or a
      // real browser (Playwright) — tracked as a follow-up, not covered here.
      render(<BoardClient {...baseProps} />);
      const monday = poolCell("Monday");
      const handle = within(monday).getByText("Alice").closest("[data-rfd-drag-handle-draggable-id]") as HTMLElement;

      handle.focus();
      handle.dispatchEvent(new KeyboardEvent("keydown", { keyCode: 32, bubbles: true }));
      await new Promise((r) => setTimeout(r, 20));
      handle.dispatchEvent(new KeyboardEvent("keydown", { keyCode: 40, bubbles: true })); // ArrowDown
      await new Promise((r) => setTimeout(r, 20));
      handle.dispatchEvent(new KeyboardEvent("keydown", { keyCode: 32, bubbles: true }));
      await new Promise((r) => setTimeout(r, 20));

      const order = [...within(monday).getAllByText(/^(Alice|Bob)$/)].map((el) => el.textContent);
      expect(order).toEqual(["Bob", "Alice"]);
    },
  );
});

describe("BoardClient — copy day", () => {
  it("opens the site-selection dialog and copies once confirmed", async () => {
    const dbAssignments: Assignment[] = [
      { employeeId: "e1", projectId: "p1", date: new Date(weekDates.Monday), weekId: "week-1", dayPart: "full_day" },
    ];
    const user = userEvent.setup();
    render(<BoardClient {...baseProps} dbAssignments={dbAssignments} />);

    await user.click(within(document.body).getByTitle(tp("copyAssignmentsTo", { day: "Tuesday" })));
    await user.click(within(copyFromPopover()).getByRole("button", { name: "Monday" }));

    expect(boardActions.copyDayAssignments).not.toHaveBeenCalled();
    expect(document.body).toHaveTextContent("siteCopyTitle");

    await user.click(within(document.body).getByRole("button", { name: "copy" }));

    expect(boardActions.copyDayAssignments).toHaveBeenCalledWith(weekDates.Monday, weekDates.Tuesday, "week-1", ["p1"]);
    expect(within(projectCell("p1", "Tuesday")).getByText("Alice")).toBeInTheDocument();
    // Source day is unaffected.
    expect(within(projectCell("p1", "Monday")).getByText("Alice")).toBeInTheDocument();
  });

  it("overwrites existing target-day assignments once confirmed", async () => {
    const dbAssignments: Assignment[] = [
      { employeeId: "e1", projectId: "p1", date: new Date(weekDates.Monday), weekId: "week-1", dayPart: "full_day" },
      { employeeId: "e2", projectId: "p1", date: new Date(weekDates.Tuesday), weekId: "week-1", dayPart: "full_day" },
    ];
    const user = userEvent.setup();
    render(<BoardClient {...baseProps} dbAssignments={dbAssignments} />);

    await user.click(within(document.body).getByTitle(tp("copyAssignmentsTo", { day: "Tuesday" })));
    await user.click(within(copyFromPopover()).getByRole("button", { name: "Monday" }));
    await user.click(within(document.body).getByRole("button", { name: "copy" }));

    expect(boardActions.copyDayAssignments).toHaveBeenCalledWith(weekDates.Monday, weekDates.Tuesday, "week-1", ["p1"]);
    expect(within(projectCell("p1", "Tuesday")).getByText("Alice")).toBeInTheDocument();
    expect(within(projectCell("p1", "Tuesday")).queryByText("Bob")).not.toBeInTheDocument();
  });

  it("deselecting the only site leaves the target day untouched", async () => {
    const dbAssignments: Assignment[] = [
      { employeeId: "e1", projectId: "p1", date: new Date(weekDates.Monday), weekId: "week-1", dayPart: "full_day" },
    ];
    const user = userEvent.setup();
    render(<BoardClient {...baseProps} dbAssignments={dbAssignments} />);

    await user.click(within(document.body).getByTitle(tp("copyAssignmentsTo", { day: "Tuesday" })));
    await user.click(within(copyFromPopover()).getByRole("button", { name: "Monday" }));
    await user.click(within(document.body).getByRole("button", { name: "siteCopyDeselectAll" }));

    expect(within(document.body).getByRole("button", { name: "copy" })).toBeDisabled();
  });
});

describe("BoardClient — copy previous week", () => {
  it("shows the copy-week modal via the side menu and persists on confirm", async () => {
    const priorWeekDates = getWeekDateMap(toDateParam(new Date(new Date(WEEK_START).getTime() - 7 * 86400000)));
    const previousWeek: BoardWeek = {
      id: "week-0",
      startDateIso: priorWeekDates.Monday,
      endDateIso: priorWeekDates.Friday,
      param: toDateParam(priorWeekDates.Monday),
      label: "prior week",
      isCurrent: false,
    };

    const user = userEvent.setup();
    render(<BoardClient {...baseProps} weeks={[previousWeek, selectedWeek]} />);

    // Two elements share the "openMenu" title (mobile hamburger + the
    // floating side-menu toggle); the side-menu one is the second in the DOM.
    await user.click(document.querySelectorAll('[title="openMenu"]')[1] as HTMLElement);
    await user.click(within(document.body).getByText("copyPrevWeek"));

    expect(document.body).toHaveTextContent("copyWeekTitle");
    await user.click(within(document.body).getByRole("button", { name: "copy" }));

    expect(boardActions.copyWeekAssignments).toHaveBeenCalledWith(
      "week-0",
      "week-1",
      previousWeek.startDateIso,
      selectedWeek.startDateIso,
    );
  });
});

describe("BoardClient — holidays", () => {
  it("applying a public holiday clears that day's assignments and shows the badge", async () => {
    const dbAssignments: Assignment[] = [
      { employeeId: "e1", projectId: "p1", date: new Date(weekDates.Tuesday), weekId: "week-1", dayPart: "full_day" },
    ];
    const user = userEvent.setup();
    render(<BoardClient {...baseProps} dbAssignments={dbAssignments} />);

    await user.click(holidayGearButton("Tuesday"));
    await user.click(within(document.body).getByText("setPublicHoliday"));

    expect(boardActions.setHoliday).toHaveBeenCalledWith(weekDates.Tuesday, "week-1", "public_holiday", []);
    expect(within(projectCell("p1", "Tuesday")).queryByText("Alice")).not.toBeInTheDocument();
    expect(document.body).toHaveTextContent("publicHoliday");
  });

  it("applying a company holiday sends every employee and clears the whole day including the pool", async () => {
    const user = userEvent.setup();
    render(<BoardClient {...baseProps} />);

    await user.click(holidayGearButton("Wednesday"));
    await user.click(within(document.body).getByText("setCompanyHoliday"));

    expect(boardActions.setHoliday).toHaveBeenCalledWith(weekDates.Wednesday, "week-1", "company_holiday", ["e1", "e2"]);
    expect(within(poolCell("Wednesday")).queryByText("Alice")).not.toBeInTheDocument();
    expect(within(poolCell("Wednesday")).queryByText("Bob")).not.toBeInTheDocument();
    expect(document.body).toHaveTextContent("companyHoliday");
  });

  it("clearing a holiday removes the badge and persists the clear", async () => {
    const user = userEvent.setup();
    render(<BoardClient {...baseProps} dbHolidays={[{ dateIso: weekDates.Thursday, type: "public_holiday" }]} />);

    expect(document.body).toHaveTextContent("publicHoliday");
    await user.click(holidayGearButton("Thursday"));
    await user.click(within(document.body).getByText("clearHoliday"));

    expect(boardActions.clearHoliday).toHaveBeenCalledWith(weekDates.Thursday, "public_holiday");
    expect(document.body).not.toHaveTextContent("publicHoliday");
  });
});

describe("BoardClient — status transitions", () => {
  it("applies a transition immediately when it doesn't touch existing assignments", async () => {
    const user = userEvent.setup();
    render(<BoardClient {...baseProps} />); // p1 is "active", no assignments

    await user.click(within(document.body).getByText("active")); // status chip
    await user.click(within(document.body).getByText("on_hold")); // transition option

    expect(siteActions.setSiteTransition).toHaveBeenCalledWith("p1", selectedWeek.param, "on_hold");
    expect(boardActions.clearProjectAssignmentsForWeek).not.toHaveBeenCalled();
    expect(document.body).not.toHaveTextContent("holdTitle");
  });

  it("confirms before putting a project with existing assignments on hold, then clears them", async () => {
    const dbAssignments: Assignment[] = [
      { employeeId: "e1", projectId: "p1", date: new Date(weekDates.Monday), weekId: "week-1", dayPart: "full_day" },
    ];
    const user = userEvent.setup();
    render(<BoardClient {...baseProps} dbAssignments={dbAssignments} />);

    await user.click(within(document.body).getByText("active"));
    await user.click(within(document.body).getByText("on_hold"));

    expect(siteActions.setSiteTransition).not.toHaveBeenCalled();
    expect(document.body).toHaveTextContent("holdTitle");

    await user.click(within(document.body).getByText("putOnHold"));

    expect(siteActions.setSiteTransition).toHaveBeenCalledWith("p1", selectedWeek.param, "on_hold");
    expect(boardActions.clearProjectAssignmentsForWeek).toHaveBeenCalledWith("p1", "week-1");
  });

  it("confirms before marking a project done, warns about assignment count, and applies on confirm", async () => {
    const dbAssignments: Assignment[] = [
      { employeeId: "e1", projectId: "p1", date: new Date(weekDates.Monday), weekId: "week-1", dayPart: "full_day" },
    ];
    const user = userEvent.setup();
    render(<BoardClient {...baseProps} dbAssignments={dbAssignments} />);

    await user.click(within(document.body).getByText("active"));
    await user.click(within(document.body).getByText("done"));

    expect(siteActions.setSiteTransition).not.toHaveBeenCalled();
    expect(document.body).toHaveTextContent("completeWarn");

    await user.click(within(document.body).getByText("apply"));

    expect(siteActions.setSiteTransition).toHaveBeenCalledWith("p1", selectedWeek.param, "done", true);
  });
});

describe("BoardClient — past-week edits", () => {
  // confirmPastEdit() compares selectedWeek.startDateIso against real new Date(),
  // so this fixture must be dated before whenever the test actually runs.
  const pastWeekDates = getWeekDateMap("2020-01-06T00:00:00.000Z");
  const pastWeek: BoardWeek = {
    id: "past-week",
    startDateIso: pastWeekDates.Monday,
    endDateIso: pastWeekDates.Friday,
    param: toDateParam(pastWeekDates.Monday),
    label: "past week",
    isCurrent: false,
  };
  const pastProps = { ...baseProps, selectedWeek: pastWeek, weeks: [pastWeek] };

  it("defers a mutation behind a confirmation modal, then runs it once confirmed", async () => {
    const user = userEvent.setup();
    render(<BoardClient {...pastProps} />);

    const monday = poolCell("Monday");
    await user.click(within(monday).getByText("Alice"));
    await user.click(within(cardOf(monday, "Alice")).getByTitle("markAsSick"));

    // Nothing happened yet — the edit is parked behind the modal.
    expect(boardActions.setAvailability).not.toHaveBeenCalled();
    expect(within(poolCell("Monday")).getByText("Alice")).toBeInTheDocument();
    expect(document.body).toHaveTextContent("pastWeekTitle");

    await user.click(within(document.body).getByText("pastWeekConfirm"));

    expect(boardActions.setAvailability).toHaveBeenCalledWith("e1", pastWeekDates.Monday, "past-week", "sick", "full_day");
    expect(within(poolCell("Monday")).queryByText("Alice")).not.toBeInTheDocument();
  });

  it("muting past-week warnings lets a later edit in the same week run immediately", async () => {
    const user = userEvent.setup();
    render(<BoardClient {...pastProps} />);

    const monday = poolCell("Monday");
    await user.click(within(monday).getByText("Alice"));
    await user.click(within(cardOf(monday, "Alice")).getByTitle("markAsSick"));
    await user.click(within(document.body).getByText("pastWeekMute"));

    expect(boardActions.setAvailability).toHaveBeenCalledWith("e1", pastWeekDates.Monday, "past-week", "sick", "full_day");

    // Second edit, same session: no modal this time.
    await user.click(within(monday).getByText("Bob"));
    await user.click(within(cardOf(monday, "Bob")).getByTitle("markAsVacation"));

    expect(document.body).not.toHaveTextContent("pastWeekTitle");
    expect(boardActions.setAvailability).toHaveBeenCalledWith("e2", pastWeekDates.Monday, "past-week", "vacation", "full_day");
  });
});
