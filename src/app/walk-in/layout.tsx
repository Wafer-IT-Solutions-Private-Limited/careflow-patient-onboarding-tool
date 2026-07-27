import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/auth";

export default async function WalkInLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) redirect("/login");

  try {
    const decoded = await verifyToken(token);
    if (decoded.role !== "ADMIN" && decoded.role !== "DOCTOR") redirect("/unauthorized");
  } catch {
    redirect("/login");
  }

  return <>{children}</>;
}
