// prisma/seed.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("Start seeding...");

    // 1. Create Projects (Baustellen)
    const project1 = await prisma.project.create({
        data: { name: "Baustelle Nord-Tunnel" },
    });
    const project2 = await prisma.project.create({
        data: { name: "Baustelle West-Zentrum" },
    });
    const project3 = await prisma.project.create({
        data: { name: "Projekt Süd-Brücke" },
    });

    // 2. Create Employees
    const employeesData = [
        { name: "Max Müller", initials: "MM", img: "https://i.pravatar.cc/150?u=m1", role: "Vorarbeiter" },
        { name: "Lisa Schmidt", initials: "LS", img: "https://i.pravatar.cc/150?u=m2", role: "Elektrikerin" },
        { name: "Ali Yilmaz", initials: "AY", img: "https://i.pravatar.cc/150?u=m3", role: "Tiefbau" },
        { name: "Sarah Weber", initials: "SW", img: "https://i.pravatar.cc/150?u=m4", role: "Azubi" },
        { name: "Peter Klein", initials: "PK", img: "https://i.pravatar.cc/150?u=m5", role: "Maurer" },
    ];

    for (const emp of employeesData) {
        await prisma.employee.create({
            data: emp,
        });
    }

    console.log("Seeding finished! Created 3 projects and 5 employees.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });