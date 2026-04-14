// src/components/board/EmployeeCard.tsx
"use client";

import React from "react";
import { Draggable } from "@hello-pangea/dnd";
import type { DayPart, Employee } from "~/types";
import { SyringeIcon, PalmTreeIcon, SplitDayIcon, MergeIcon, AssignSiteIcon } from "~/components/icons";

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
                ? "scale-105 border-[#5a5961] bg-[#3f3e45]"
                : isOpen
                  ? "border-[#5a5961] bg-[#3a3940]"
                  : dayPart === "pre_lunch"
                    ? "border-[var(--am-border)] bg-[var(--am-card)]"
                    : dayPart === "after_lunch"
                      ? "border-[var(--pm-border)] bg-[var(--pm-card)]"
                      : "border-transparent bg-[#302f36] hover:border-[#4a4950]"
            }`}
          >
            <div className="h-7 w-7 flex-shrink-0 overflow-hidden rounded-full bg-gray-600">
              {employee.img && (
                <img src={employee.img} alt={employee.name} className="h-full w-full object-cover" />
              )}
            </div>
            <span className={`text-xs font-medium text-[#ececef] ${isHalfDay ? "truncate" : "whitespace-nowrap"}`}>
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
                className="fly-btn fly-btn-merge text-[#c8c4be]"
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
                  className="fly-btn fly-btn-assign-site text-[#c8c4be]"
                >
                  <AssignSiteIcon />
                </button>
              )}
              {onSplitDay && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onSplitDay(); }}
                  title="Split into half-days"
                  className="fly-btn fly-btn-split text-[#c8c4be]"
                >
                  <SplitDayIcon />
                </button>
              )}

              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onMarkSick(); }}
                title="Mark as sick"
                className={`fly-btn fly-btn-sick text-[#c8c4be] ${!onSplitDay ? "fly-btn-sick-nosplit" : ""}`}
              >
                <SyringeIcon />
              </button>

              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onMarkVacation(); }}
                title="Mark as on vacation"
                className="fly-btn fly-btn-vacation text-[#c8c4be]"
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
