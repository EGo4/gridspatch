// src/types/index.ts

export type Employee = {
    id: string;
    name: string;
    img: string | null;
};

export type Project = {
    id: string;
    name: string;
};

export type Assignment = {
    employeeId: string;
    projectId: string | null;
    date: Date;
};