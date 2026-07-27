import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function PatientLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const token = store.get("token")?.value;
  if (!token) redirect("/login");

  try {
    const jwt = await verifyToken(token);
    const patient = await prisma.patient.findFirst({
      where:  { userId: jwt.id },
      select: { healthSetupComplete: true },
    });
    if (patient && !patient.healthSetupComplete) {
      redirect("/health-setup");
    }
  } catch {
    redirect("/login");
  }

  return <>{children}</>;
}
