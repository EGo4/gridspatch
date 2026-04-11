// src/components/board/EmployeeCard.tsx
"use client";

import React from "react";
import { Draggable } from "@hello-pangea/dnd";
import type { Employee } from "~/types";
import { SyringeIcon, PalmTreeIcon } from "~/components/icons";

interface EmployeeCardProps {
  employee: Employee;
  index: number;
  draggableId: string;
  isOpen: boolean;
  onToggle: () => void;
  onMarkSick: () => void;
  onMarkVacation: () => void;
}

export function EmployeeCard({
  employee,
  index,
  draggableId,
  isOpen,
  onToggle,
  onMarkSick,
  onMarkVacation,
}: EmployeeCardProps) {
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
            className={`flex w-full min-w-max cursor-pointer select-none items-center gap-2.5 rounded-full border p-1.5 text-sm transition-colors ${
              snapshot.isDragging
                ? "scale-105 border-[#5a5961] bg-[#3f3e45]"
                : isOpen
                  ? "border-[#5a5961] bg-[#3a3940]"
                  : "border-transparent bg-[#302f36] hover:border-[#4a4950]"
            }`}
          >
            <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-gray-600">
              {employee.img && (
                <img src={employee.img} alt={employee.name} className="h-full w-full object-cover" />
              )}
            </div>
            <span className="whitespace-nowrap text-xs font-medium text-[#ececef]">
              {employee.name}
            </span>
          </div>

          {/* Sick button */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMarkSick(); }}
            title="Mark as sick"
            className="fly-btn fly-btn-sick text-[#c8c4be]"
          >
            <SyringeIcon />
          </button>

          {/* Vacation button */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMarkVacation(); }}
            title="Mark as on vacation"
            className="fly-btn fly-btn-vacation text-[#c8c4be]"
          >
            <PalmTreeIcon />
          </button>
        </div>
      )}
    </Draggable>
  );
}
