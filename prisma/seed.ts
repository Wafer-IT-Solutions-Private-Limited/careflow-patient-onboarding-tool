import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import bcrypt from "bcryptjs";

const pool    = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma  = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding PostgreSQL database…");

  const [adminHash, doctorHash, patientHash] = await Promise.all([
    bcrypt.hash("admin123",   10),
    bcrypt.hash("doctor123",  10),
    bcrypt.hash("patient123", 10),
  ]);

  // Admin  → sys.admin@hospital.com   (matches *.admin@hospital.com rule)
  const admin = await prisma.user.upsert({
    where:  { email: "sys.admin@hospital.com" },
    update: {},
    create: {
      name:       "System Admin",
      email:      "sys.admin@hospital.com",
      password:   adminHash,
      role:       "ADMIN",
      isVerified: true,
    },
  });

  // Doctor → dr.sarah@hospital.com   (matches @hospital.com rule, not admin)
  const doctor = await prisma.user.upsert({
    where:  { email: "dr.sarah@hospital.com" },
    update: {},
    create: {
      name:       "Dr. Sarah Johnson",
      email:      "dr.sarah@hospital.com",
      password:   doctorHash,
      role:       "DOCTOR",
      isVerified: true,
      doctorProfile: {
        create: {
          licenseNumber:  "LIC-2024-001",
          specialization: "Cardiology",
          approved:       true,
        },
      },
    },
  });

  // Patient → john.smith@gmail.com   (non-hospital email = patient)
  const patient = await prisma.user.upsert({
    where:  { email: "john.smith@gmail.com" },
    update: {},
    create: {
      name:       "John Smith",
      email:      "john.smith@gmail.com",
      password:   patientHash,
      role:       "PATIENT",
      isVerified: true,
      patientProfile: {
        create: { dateOfBirth: new Date("1990-05-15") },
      },
    },
  });

  console.log("✅ Seeded:");
  console.log(`  Admin   → ${admin.email}   / admin123`);
  console.log(`  Doctor  → ${doctor.email}  / doctor123`);
  console.log(`  Patient → ${patient.email} / patient123`);
}

main()
  .catch((e) => { console.error("❌ Seed failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
