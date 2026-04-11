// src/components/board/EmployeeCard.tsx
"use client";

import React from "react";
import { Draggable } from "@hello-pangea/dnd";
import type { Employee } from "~/types";

interface EmployeeCardProps {
    employee: Employee;
    index: number;
    draggableId: string;
}

export function EmployeeCard({ employee, index, draggableId }: EmployeeCardProps) {
    return (
        <Draggable draggableId={draggableId} index={index}>
            {(provided, snapshot) => (
                <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    className={`flex w-full min-w-max items-center gap-2.5 rounded-full border p-1.5 text-sm ${snapshot.isDragging ? "bg-[#3f3e45] z-50 scale-105" : "bg-[#302f36]"
                        }`}
                >
                    <div className="w-8 h-8 rounded-full bg-gray-600 flex-shrink-0 overflow-hidden">
                        {employee.img && <img src={employee.img} alt={employee.name} className="w-full h-full object-cover" />}
                    </div>
                    <span className="whitespace-nowrap font-medium text-xs text-[#ececef]">{employee.name}</span>
                </div>
            )}
        </Draggable>
    );
}
