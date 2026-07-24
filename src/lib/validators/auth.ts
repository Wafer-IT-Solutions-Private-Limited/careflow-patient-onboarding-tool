import { z } from "zod";

// ── Email domain rules ────────────────────────────────────────────────────────
// Admin  : [name].admin@hospital.com   e.g. sys.admin@hospital.com
// Doctor : *@hospital.com              e.g. dr.sarah@hospital.com
// Patient: any other valid email       e.g. john@gmail.com, jane@hotmail.com

const ADMIN_RE    = /^[a-zA-Z0-9]+\.admin@hospital\.com$/i;
const HOSPITAL_RE = /@hospital\.com$/i;

export function detectRoleFromEmail(email: string): "ADMIN" | "DOCTOR" | "PATIENT" {
  if (ADMIN_RE.test(email))    return "ADMIN";
  if (HOSPITAL_RE.test(email)) return "DOCTOR";
  return "PATIENT";
}

export function isPatientEmail(email: string)  { return !HOSPITAL_RE.test(email); }
export function isDoctorEmail(email: string)   { return HOSPITAL_RE.test(email) && !ADMIN_RE.test(email); }
export function isAdminEmail(email: string)    { return ADMIN_RE.test(email); }

// ── Login schema (accepts any valid email — role is validated server-side) ───
export const loginSchema = z.object({
  email:    z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ── Registration schemas (enforce domain rules at sign-up time) ──────────────
export const patientRegisterSchema = z.object({
  name:     z.string().min(2, "Name must be at least 2 characters"),
  email:    z.string().email("Invalid email address").refine(
    (e) => isPatientEmail(e),
    { message: "Patient accounts cannot use @hospital.com email addresses" },
  ),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const doctorRegisterSchema = z.object({
  name:           z.string().min(2, "Name is required"),
  email:          z.string().email("Invalid email address").refine(
    (e) => isDoctorEmail(e),
    { message: "Doctor email must be @hospital.com (not the .admin format)" },
  ),
  password:       z.string().min(8, "Password must be at least 8 characters"),
  licenseNumber:  z.string().min(3, "License number is required"),
  specialization: z.string().min(2, "Specialization is required"),
});

export type PatientRegisterInput = z.infer<typeof patientRegisterSchema>;
export type DoctorRegisterInput  = z.infer<typeof doctorRegisterSchema>;
