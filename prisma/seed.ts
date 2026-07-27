import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import bcrypt from "bcryptjs";

const pool    = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma  = new PrismaClient({ adapter });

const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");

async function main() {
  console.log("🌱 Seeding PostgreSQL database…");

  const [adminHash, doctorHash, patientHash] = await Promise.all([
    bcrypt.hash("admin123",   10),
    bcrypt.hash("doctor123",  10),
    bcrypt.hash("patient123", 10),
  ]);

  // Admin
  await prisma.user.upsert({
    where:  { email: "sys.admin@hospital.com" },
    update: {},
    create: {
      name: "System Admin", email: "sys.admin@hospital.com",
      password: adminHash, role: "ADMIN", isVerified: true,
    },
  });

  // Doctor
  await prisma.user.upsert({
    where:  { email: "dr.sarah@hospital.com" },
    update: {},
    create: {
      name: "Dr. Sarah Johnson", email: "dr.sarah@hospital.com",
      password: doctorHash, role: "DOCTOR", isVerified: true,
      doctorProfile: {
        create: { licenseNumber: "LIC-2024-001", specialization: "Cardiology", approved: true },
      },
    },
  });

  // Second doctor
  await prisma.user.upsert({
    where:  { email: "dr.patel@hospital.com" },
    update: {},
    create: {
      name: "Dr. Raj Patel", email: "dr.patel@hospital.com",
      password: doctorHash, role: "DOCTOR", isVerified: true,
      doctorProfile: {
        create: { licenseNumber: "LIC-2024-002", specialization: "General Medicine", approved: true },
      },
    },
  });

  // Patient with PRN
  await prisma.user.upsert({
    where:  { email: "john.smith@gmail.com" },
    update: {},
    create: {
      name: "John Smith", email: "john.smith@gmail.com",
      password: patientHash, role: "PATIENT", isVerified: true,
      patientProfile: {
        create: {
          prn: `PAT-${today}-0001`,
          name: "John Smith",
          dateOfBirth: new Date("1990-05-15"),
          gender: "Male",
          phone: "9876543210",
          healthSetupComplete: true,
        },
      },
    },
  });

  // Seed the daily counter so next PRN starts at 0002
  await prisma.dailyCounter.upsert({
    where: { type_date: { type: "PRN", date: today } },
    update: {},
    create: { type: "PRN", date: today, count: 1 },
  });

  console.log("✅ Seeded:");
  console.log("  Admin   → sys.admin@hospital.com  / admin123");
  console.log("  Doctor  → dr.sarah@hospital.com   / doctor123");
  console.log("  Doctor  → dr.patel@hospital.com   / doctor123");
  console.log("  Patient → john.smith@gmail.com     / patient123");
}

main()
  .catch((e) => { console.error("❌ Seed failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
