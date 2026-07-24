import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/auth";
import { ROLE_REDIRECTS } from "@/constants/roles";
import LoginForm from "@/components/LoginForm";

export default async function LoginPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  if (token) {
    try {
      const decoded = await verifyToken(token);
      redirect(ROLE_REDIRECTS[decoded.role] ?? "/");
    } catch {
      // invalid/expired token — fall through to show login form
    }
  }

  return <LoginForm />;
}
