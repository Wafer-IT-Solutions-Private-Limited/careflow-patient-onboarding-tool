export type Role = "ADMIN" | "DOCTOR" | "PATIENT";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  iat?: number;
  exp?: number;
}
