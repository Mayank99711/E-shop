import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 1. Check database Employee columns
  const columns = await prisma.$queryRaw`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Employee'
      AND column_name IN (
        'userId',
        'employeeRole',
        'permissionOverrides'
      )
    ORDER BY column_name;
  `;

  console.log("\n[EMPLOYEE COLUMNS]");
  console.table(columns);

  // 2. Verify SHOP_EMPLOYEE enum value
  const roles = await prisma.$queryRaw`
    SELECT enumlabel
    FROM pg_enum
    JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
    WHERE pg_type.typname = 'UserRole'
    ORDER BY enumsortorder;
  `;

  console.log("\n[USER ROLES]");
  console.table(roles);

  // 3. Count existing employees
  const employeeCount = await prisma.employee.count();

  console.log("\n[EXISTING EMPLOYEES]");
  console.log("Total employees:", employeeCount);

  const validColumns = ["employeeRole", "permissionOverrides", "userId"].every(
    (name) => columns.some((column) => column.column_name === name),
  );

  const validRole = roles.some((role) => role.enumlabel === "SHOP_EMPLOYEE");

  if (!validColumns || !validRole) {
    throw new Error("Employee database schema verification failed.");
  }

  console.log("\n[SUCCESS]");
  console.log("Employee schema verification passed.");
}

main()
  .catch((error) => {
    console.error("\n[FAILED]", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
