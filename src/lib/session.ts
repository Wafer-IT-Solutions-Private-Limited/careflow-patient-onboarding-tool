import { cookies } from "next/headers";
import { verifyToken } from "./auth";
import type { JWTPayload } from "./auth";

export async function getSession(): Promise<JWTPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}
