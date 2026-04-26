// src/components/board/EmployeeCard.tsx
"use client";

import React from "react";
import { Draggable } from "@hello-pangea/dnd";
import type { DayPart, Employee } from "~/types";
import { SyringeIcon, PalmTreeIcon, SplitDayIcon, MergeIcon, AssignSiteIcon, UserIcon } from "~/components/icons";

interface EmployeeCardProps {
  employee: Employee;
  index: number;
  draggableId: string;
  dayPart: DayPart;
  isOpen: boolean;
  onToggle: () => void;
  onMarkSick: () => void;
  onMarkVacation: () => void;
  /** Only passed for full-day cards inside a project cell (not pool). */
  onSplitDay?: () => void;
  /** Only passed for half-day cards. */
  onMergeDay?: () => void;
  /** Pool cards only: open the "assign to site" picker anchored to the button. */
  onAssignToSite?: (anchor: { left: number; top: number }) => void;
}

export function EmployeeCard({
  employee,
  index,
  draggableId,
  dayPart,
  isOpen,
  onToggle,
  onMarkSick,
  onMarkVacation,
  onSplitDay,
  onMergeDay,
  onAssignToSite,
}: EmployeeCardProps) {
  const isHalfDay = dayPart !== "full_day";

  return (
    <Draggable draggableId={draggableId} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={`relative ${isOpen ? "card-open z-50" : ""}`}
        >
          {/* Card — drag handle + click target */}
          <div
            {...provided.dragHandleProps}
            onClick={onToggle}
            className={`flex w-full ${isHalfDay ? "min-w-0" : "min-w-max"} cursor-pointer select-none items-center gap-2.5 rounded-full border p-1.5 text-sm transition-colors ${
              snapshot.isDragging
                ? "scale-105 border-[var(--color-card-drag-border)] bg-[var(--color-card-drag)]"
                : isOpen
                  ? "border-[var(--color-card-open-border)] bg-[var(--color-card-open)]"
                  : dayPart === "pre_lunch"
                    ? "border-[var(--am-border)] bg-[var(--am-card)]"
                    : dayPart === "after_lunch"
                      ? "border-[var(--pm-border)] bg-[var(--pm-card)]"
                      : "border-transparent bg-[var(--color-card-bg)] hover:border-[var(--color-card-hover)]"
            }`}
          >
            <div className="h-7 w-7 flex-shrink-0 overflow-hidden rounded-full bg-[var(--color-avatar-bg)] flex items-center justify-center">
              {employee.img ? (
                <img src={employee.img} alt={employee.name} className="h-full w-full object-cover" />
              ) : (
                <UserIcon size={16} className="text-[var(--color-text-muted)]" />
              )}
            </div>
            <span className={`text-xs font-medium text-[var(--color-text-primary)] ${isHalfDay ? "truncate" : "whitespace-nowrap"}`}>
              {employee.name}
            </span>
          </div>

          {/* Fly-out buttons */}
          {isHalfDay ? (
            /* Half-day card: only merge button */
            onMergeDay && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onMergeDay(); }}
                title="Merge back to full day"
                className="fly-btn fly-btn-merge text-[var(--color-text-secondary)]"
              >
                <MergeIcon />
              </button>
            )
          ) : (
            /* Full-day card: assign-site (pool only) or split (project only), sick, vacation */
            <>
              {onAssignToSite && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    onAssignToSite({ left: rect.left, top: rect.top });
                  }}
                  title="Assign to building site"
                  className="fly-btn fly-btn-assign-site text-[var(--color-text-secondary)]"
                >
                  <AssignSiteIcon />
                </button>
              )}
              {onSplitDay && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onSplitDay(); }}
                  title="Split into half-days"
                  className="fly-btn fly-btn-split text-[var(--color-text-secondary)]"
                >
                  <SplitDayIcon />
                </button>
              )}

              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onMarkSick(); }}
                title="Mark as sick"
                className={`fly-btn fly-btn-sick text-[var(--color-text-secondary)] ${!onSplitDay ? "fly-btn-sick-nosplit" : ""}`}
              >
                <SyringeIcon />
              </button>

              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onMarkVacation(); }}
                title="Mark as on vacation"
                className="fly-btn fly-btn-vacation text-[var(--color-text-secondary)]"
              >
                <PalmTreeIcon />
              </button>
            </>
          )}
        </div>
      )}
    </Draggable>
  );
}
