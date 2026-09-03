export const ROLES = {
  ADMIN: "ADMIN",
  DOCTOR: "DOCTOR",
  NURSE: "NURSE",
  PATIENT: "PATIENT",
} as const;

export type RoleKey = keyof typeof ROLES;

export const ROLE_REDIRECTS: Record<string, string> = {
  ADMIN: "/admin",
  DOCTOR: "/doctor",
  NURSE: "/nurse",
  PATIENT: "/patient",
};
