import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const employees = await prisma.employee.findMany({
    select: {
      id: true,
      employeeCode: true,
      name: true,
      email: true,
      isActive: true,
      employeeRole: true,
      userId: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  const emails = [
    ...new Set(
      employees
        .map((employee) => employee.email?.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];

  const existingUsers = emails.length
    ? await prisma.user.findMany({
        where: {
          email: { in: emails },
        },
        select: {
          id: true,
          email: true,
          role: true,
        },
      })
    : [];

  const usersByEmail = new Map(
    existingUsers.map((user) => [user.email.toLowerCase(), user]),
  );

  const rows = employees.map((employee) => {
    const email = employee.email?.trim().toLowerCase();
    const existingUser = email ? usersByEmail.get(email) : null;

    return {
      employeeCode: employee.employeeCode,
      name: employee.name,
      emailAvailable: Boolean(email),
      active: employee.isActive,
      role: employee.employeeRole || "NOT_ASSIGNED",
      loginLinked: Boolean(employee.userId),
      emailConflict:
        Boolean(existingUser) && existingUser.id !== employee.userId,
    };
  });

  console.log("\n[EMPLOYEE LOGIN READINESS]");
  console.table(rows);

  console.log("\n[SUMMARY]");

  console.log("Total employees:", rows.length);

  console.log(
    "Without email:",
    rows.filter((row) => !row.emailAvailable).length,
  );

  console.log(
    "Without assigned role:",
    rows.filter((row) => row.role === "NOT_ASSIGNED").length,
  );

  console.log(
    "Already linked to login:",
    rows.filter((row) => row.loginLinked).length,
  );

  console.log(
    "Email conflicts:",
    rows.filter((row) => row.emailConflict).length,
  );

  console.log("\nVerification completed. No data was modified.");
} catch (error) {
  console.error("Verification failed:", error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
