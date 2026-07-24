import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "MeFy — Hospital Management System",
  description: "Role-based hospital management platform for doctors, patients, and admins",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: { borderRadius: "12px", fontSize: "14px" },
          }}
        />
        {children}
      </body>
    </html>
  );
}
