"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { isPatientEmail } from "@/lib/validators/auth";

const schema = z.object({
  name:     z.string().min(2, "Full name must be at least 2 characters"),
  email:    z.string()
              .email("Invalid email address")
              .refine(isPatientEmail, { message: "Patient accounts cannot use @hospital.com email" }),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirm:  z.string(),
}).refine((d) => d.password === d.confirm, {
  message: "Passwords do not match",
  path:    ["confirm"],
});

type Fields = z.infer<typeof schema>;

export default function RegisterForm() {
  const router = useRouter();
  const [loading, setLoading]   = useState(false);
  const [showPwd, setShowPwd]   = useState(false);

  const { register, handleSubmit, formState: { errors } } =
    useForm<Fields>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: Fields) => {
    setLoading(true);
    try {
      const res  = await fetch("/api/auth/register", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: data.name, email: data.email, password: data.password }),
      });
      const text = await res.text();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let json: Record<string, any>;
      try   { json = JSON.parse(text); }
      catch { toast.error(`Server error (${res.status})`); return; }

      if (!res.ok) { toast.error(json.error ?? "Registration failed"); return; }
      toast.success(`Welcome, ${json.user?.name ?? ""}! Account created.`);
      router.push(json.redirectTo);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally { setLoading(false); }
  };

  return (
    <>
      <div className="rf-root">

        {/* ── Left: registration form ── */}
        <div className="rf-left">
          <div className="rf-inner">

            <div className="rf-brand">
              <img src="/waferlogo.png" alt="Wafer Technology" className="rf-brand-logo" />
              <span className="rf-brand-name">Patient Registration</span>
            </div>

            <h1 className="rf-heading">Create your account</h1>
            <p className="rf-sub">Free to join. No hospital email required.</p>

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="rf-form">

              <div className="rf-field">
                <label className="rf-label">Full name</label>
                <input {...register("name")} type="text" placeholder="John Smith"
                  autoComplete="name"
                  className={`rf-input${errors.name ? " is-err" : ""}`} />
                {errors.name && <span className="rf-errmsg">{errors.name.message}</span>}
              </div>

              <div className="rf-field">
                <label className="rf-label">Email address</label>
                <input {...register("email")} type="email" placeholder="you@gmail.com"
                  autoComplete="email"
                  className={`rf-input${errors.email ? " is-err" : ""}`} />
                {errors.email && <span className="rf-errmsg">{errors.email.message}</span>}
              </div>

              <div className="rf-field">
                <label className="rf-label">Password</label>
                <div className="rf-pwd-row">
                  <input {...register("password")} type={showPwd ? "text" : "password"}
                    placeholder="Min. 8 characters" autoComplete="new-password"
                    className={`rf-input${errors.password ? " is-err" : ""}`} />
                  <button type="button" className="rf-show" onClick={() => setShowPwd(v => !v)}>
                    {showPwd ? "Hide" : "Show"}
                  </button>
                </div>
                {errors.password && <span className="rf-errmsg">{errors.password.message}</span>}
              </div>

              <div className="rf-field">
                <label className="rf-label">Confirm password</label>
                <input {...register("confirm")} type={showPwd ? "text" : "password"}
                  placeholder="Repeat your password" autoComplete="new-password"
                  className={`rf-input${errors.confirm ? " is-err" : ""}`} />
                {errors.confirm && <span className="rf-errmsg">{errors.confirm.message}</span>}
              </div>

              <button type="submit" disabled={loading} className="rf-submit">
                {loading ? "Creating account…" : "Create account"}
              </button>
            </form>

            <div className="rf-links">
              <span className="rf-muted">Already have an account?</span>
              <a href="/login" className="rf-link">Sign in</a>
            </div>
          </div>
        </div>

        {/* ── Right: info panel ── */}
        <div className="rf-right">
          <div className="rf-right-inner">

            <div className="rf-ov-logo">
              <img src="/waferlogo.png" alt="Wafer Technology" className="rf-ov-logo-img" />
            </div>

            <div className="rf-ov-headline">
              Your health journey<br />starts here.
            </div>
            <p className="rf-ov-sub">
              Create a free account to access your personal health portal,
              manage appointments, and view your medical history — all in one secure place.
            </p>

            <div className="rf-benefits">
              {[
                { icon: "🔒", text: "Your data is encrypted and private" },
                { icon: "📋", text: "View and track your medical records" },
                { icon: "📅", text: "Book and manage appointments" },
                { icon: "💬", text: "Communicate with your care team" },
              ].map(({ icon, text }) => (
                <div key={text} className="rf-benefit">
                  <span className="rf-benefit-icon">{icon}</span>
                  <span className="rf-benefit-text">{text}</span>
                </div>
              ))}
            </div>

            <div className="rf-note">
              Hospital staff? Contact your administrator for access.
            </div>

          </div>
        </div>
      </div>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .rf-root {
          display: grid;
          grid-template-columns: 1fr 1fr;
          min-height: 100vh;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
        }

        /* ── Left ── */
        .rf-left {
          background: #F5F4F2;
          display: flex; align-items: center; justify-content: center;
          padding: 40px 28px;
        }
        .rf-inner { width: 100%; max-width: 360px; }

        .rf-brand {
          display: flex; align-items: center; gap: 10px;
          margin-bottom: 24px;
        }
        .rf-brand-logo  { height: 34px; width: auto; object-fit: contain; }
        .rf-brand-name  { font-size: 17px; font-weight: 700; color: #0C1929; letter-spacing: -.2px; }

        .rf-heading {
          font-size: 26px; font-weight: 700;
          color: #0C1929; letter-spacing: -.5px;
          line-height: 1.15; margin-bottom: 5px;
        }
        .rf-sub { font-size: 13px; color: #888; margin-bottom: 24px; }

        .rf-form   { display: flex; flex-direction: column; }
        .rf-field  { margin-bottom: 14px; }
        .rf-label  {
          display: block; font-size: 11px; font-weight: 700;
          letter-spacing: .07em; text-transform: uppercase;
          color: #666; margin-bottom: 6px;
        }
        .rf-input  {
          width: 100%; padding: 10px 14px;
          border: 1.5px solid #E2E0DC; border-radius: 9px;
          font-size: 14px; color: #111; background: #FDFCFB; outline: none;
          transition: border-color .15s, box-shadow .15s;
        }
        .rf-input:focus {
          border-color: #0C1929;
          box-shadow: 0 0 0 3px rgba(12,25,41,.09);
          background: #fff;
        }
        .rf-input.is-err { border-color: #C94040; }
        .rf-errmsg { display: block; font-size: 12px; color: #C94040; margin-top: 4px; }

        .rf-pwd-row   { position: relative; }
        .rf-show {
          position: absolute; right: 12px; top: 50%;
          transform: translateY(-50%);
          background: none; border: none; cursor: pointer;
          font-size: 12px; font-weight: 600; color: #999;
        }
        .rf-show:hover { color: #333; }

        .rf-submit {
          width: 100%; padding: 12px;
          background: #0C1929; color: #fff;
          border: none; border-radius: 9px;
          font-size: 14.5px; font-weight: 600;
          cursor: pointer; margin-top: 6px;
          transition: background .15s, transform .1s; letter-spacing: .01em;
        }
        .rf-submit:hover:not(:disabled) { background: #182d47; transform: translateY(-1px); }
        .rf-submit:disabled { background: #9eaab5; cursor: not-allowed; }

        .rf-links {
          display: flex; justify-content: center; align-items: center;
          gap: 8px; margin-top: 20px; font-size: 13px;
        }
        .rf-muted { color: #999; }
        .rf-link  { color: #0C1929; font-weight: 600; text-decoration: none; }
        .rf-link:hover { text-decoration: underline; }

        /* ── Right ── */
        .rf-right {
          background: #0C1929;
          display: flex; align-items: center; justify-content: center;
          padding: 48px 44px;
        }
        .rf-right-inner { max-width: 360px; width: 100%; }

        .rf-ov-logo { margin-bottom: 32px; }
        .rf-ov-logo-img {
          height: 32px; width: auto; object-fit: contain;
          filter: brightness(0) invert(1);
        }

        .rf-ov-headline {
          font-size: 32px; font-weight: 800;
          color: #fff; line-height: 1.2;
          letter-spacing: -.8px; margin-bottom: 16px;
        }
        .rf-ov-sub {
          font-size: 14px; line-height: 1.65;
          color: rgba(255,255,255,.62); margin-bottom: 32px;
        }

        .rf-benefits { display: flex; flex-direction: column; gap: 14px; margin-bottom: 36px; }
        .rf-benefit  { display: flex; align-items: center; gap: 13px; }
        .rf-benefit-icon {
          font-size: 18px; width: 38px; height: 38px;
          background: rgba(255,255,255,.10);
          border: 1px solid rgba(255,255,255,.18);
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .rf-benefit-text { font-size: 13.5px; color: rgba(255,255,255,.82); }

        .rf-note {
          padding: 12px 16px;
          background: rgba(255,255,255,.07);
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 10px;
          font-size: 12.5px;
          color: rgba(255,255,255,.50);
        }

        @media (max-width: 820px) {
          .rf-root { grid-template-columns: 1fr; }
          .rf-right { display: none; }
        }
      `}</style>
    </>
  );
}
