export type Role = "ADMIN" | "DOCTOR" | "PATIENT";

export interface AuthUser {
  id: string;
  email?: string | null;
  name: string;
  role: Role;
  mustChangePassword?: boolean;
  iat?: number;
  exp?: number;
}
