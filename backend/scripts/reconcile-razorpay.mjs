import { PrismaClient } from "@prisma/client";
import { reconcileRazorpayReservations } from "../src/services/customer-razorpay.js";

const dryRun = process.argv.includes("--dry-run");
const prisma = new PrismaClient();

async function main() {
  if (dryRun) {
    const expired = await prisma.inventoryReservation.findMany({ where: { status: "ACTIVE", expiresAt: { lt: new Date() } }, select: { id: true, quantity: true, productVariantId: true } });
    console.log("DRY RUN: expired reservations that would be reviewed:", expired.length);
    for (const r of expired) console.log(" -", r.id, "variant", r.productVariantId, "qty", r.quantity);
    await prisma.$disconnect();
    process.exit(0);
  }
  const results = await reconcileRazorpayReservations();
  console.log(JSON.stringify(results, null, 2));
  await prisma.$disconnect();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
