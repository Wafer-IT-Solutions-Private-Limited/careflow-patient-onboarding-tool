import { z } from "zod";

// ── Email domain rules ────────────────────────────────────────────────────────
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

// ── Staff login (Admin / Doctor) — email + password ──────────────────────────
export const loginSchema = z.object({
  email:    z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

// ── Patient login — phone or PRN + password ───────────────────────────────────
export const patientLoginSchema = z.object({
  identifier: z.string().min(1, "Phone number or PRN is required"),
  password:   z.string().min(1, "Password is required"),
});
export type PatientLoginInput = z.infer<typeof patientLoginSchema>;

// ── Self-registration schema (phone + DOB mandatory, email optional) ──────────
export const patientRegisterSchema = z.object({
  name:        z.string().min(2, "Full name must be at least 2 characters"),
  phone:       z.string().min(10, "Phone number is required"),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  aadhaar:     z.string().min(12, "Aadhaar number is required"),
  email:       z.string().email("Invalid email address").optional().or(z.literal("")),
  password:    z.string().min(8, "Password must be at least 8 characters"),
});
export type PatientRegisterInput = z.infer<typeof patientRegisterSchema>;

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
export type DoctorRegisterInput = z.infer<typeof doctorRegisterSchema>;
