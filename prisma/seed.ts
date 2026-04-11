import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const prismaWithWeek = prisma as PrismaClient & {
  week: {
    upsert: (args: {
      where: { startDate: Date };
      update: { endDate: Date; isCurrent: boolean };
      create: { startDate: Date; endDate: Date; isCurrent: boolean };
    }) => Promise<unknown>;
  };
};
const DAY_IN_MS = 24 * 60 * 60 * 1000;

const normalizeWeekStart = (value: Date) => {
  const normalized = new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
  const day = normalized.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  return new Date(normalized.getTime() + diffToMonday * DAY_IN_MS);
};

async function main() {
  console.log("Start seeding...");

  const currentWeekStart = normalizeWeekStart(new Date());

  await prismaWithWeek.week.upsert({
    where: { startDate: currentWeekStart },
    update: {
      endDate: new Date(currentWeekStart.getTime() + 4 * DAY_IN_MS),
      isCurrent: true,
    },
    create: {
      startDate: currentWeekStart,
      endDate: new Date(currentWeekStart.getTime() + 4 * DAY_IN_MS),
      isCurrent: true,
    },
  });

  await prisma.project.createMany({
    data: [
      { name: "Baustelle Nord-Tunnel" },
      { name: "Baustelle West-Zentrum" },
      { name: "Projekt SÃ¼d-BrÃ¼cke" },
    ],
    skipDuplicates: true,
  });

  await prisma.employee.createMany({
    data: [
      {
        name: "Max MÃ¼ller",
        initials: "MM",
        img: "https://i.pravatar.cc/150?u=m1",
        role: "Vorarbeiter",
      },
      {
        name: "Lisa Schmidt",
        initials: "LS",
        img: "https://i.pravatar.cc/150?u=m2",
        role: "Elektrikerin",
      },
      {
        name: "Ali Yilmaz",
        initials: "AY",
        img: "https://i.pravatar.cc/150?u=m3",
        role: "Tiefbau",
      },
      {
        name: "Sarah Weber",
        initials: "SW",
        img: "https://i.pravatar.cc/150?u=m4",
        role: "Azubi",
      },
      {
        name: "Peter Klein",
        initials: "PK",
        img: "https://i.pravatar.cc/150?u=m5",
        role: "Maurer",
      },
    ],
    skipDuplicates: true,
  });

  console.log("Seeding finished! Created the current week, projects, and employees.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
