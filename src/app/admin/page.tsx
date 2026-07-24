import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import LogoutButton from "@/components/LogoutButton";

export default async function AdminPage() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/login");

  const [totalUsers, totalDoctors, totalPatients, pendingDoctors] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: "DOCTOR" } }),
      prisma.user.count({ where: { role: "PATIENT" } }),
      prisma.doctor.count({ where: { approved: false } }),
    ]);

  const recentUsers = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 6,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isVerified: true,
      createdAt: true,
    },
  });

  const stats = [
    { label: "Total Users", value: totalUsers, icon: "👥", color: "bg-violet-50 text-violet-600" },
    { label: "Doctors", value: totalDoctors, icon: "🩺", color: "bg-blue-50 text-blue-600" },
    { label: "Patients", value: totalPatients, icon: "🧑‍🤝‍🧑", color: "bg-teal-50 text-teal-600" },
    { label: "Pending Approvals", value: pendingDoctors, icon: "⏳", color: "bg-amber-50 text-amber-600" },
  ];

  const roleColor = {
    ADMIN: "bg-violet-100 text-violet-700",
    DOCTOR: "bg-blue-100 text-blue-700",
    PATIENT: "bg-teal-100 text-teal-700",
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 w-64 bg-white shadow-sm">
        <div className="flex h-16 items-center gap-3 border-b px-6">
          <span className="text-xl font-bold text-gray-800">MeFy</span>
          <span className="rounded-md bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">
            Admin
          </span>
        </div>
        <nav className="mt-6 px-4 space-y-1">
          {[
            { icon: "🏠",  label: "Dashboard",          href: "/admin",          active: true },
            { icon: "🧑‍⚕️", label: "Patient Management", href: "/admin/patients" },
            { icon: "🩺",  label: "Doctor Approvals",    href: "/admin" },
            { icon: "📊",  label: "Analytics",           href: "/admin" },
            { icon: "⚙️",  label: "Settings",            href: "/admin" },
          ].map(({ icon, label, href, active }) => (
            <a
              key={label}
              href={href}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition no-underline ${
                active
                  ? "bg-violet-50 text-violet-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <span>{icon}</span>
              {label}
            </a>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <main className="ml-64 flex-1">
        {/* Header */}
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-white px-8 shadow-sm">
          <div>
            <h1 className="text-lg font-semibold text-gray-800">
              Admin Dashboard
            </h1>
            <p className="text-xs text-gray-500">
              Logged in as {session.name}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {pendingDoctors > 0 && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                {pendingDoctors} pending approval{pendingDoctors !== 1 ? "s" : ""}
              </span>
            )}
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-violet-700">
              {session.name.charAt(0)}
            </div>
            <LogoutButton />
          </div>
        </header>

        <div className="p-8">
          {/* Stats */}
          <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {stats.map(({ label, value, icon, color }) => (
              <div key={label} className="rounded-2xl bg-white p-5 shadow-sm">
                <div className={`mb-3 inline-flex rounded-xl p-2.5 text-xl ${color}`}>
                  {icon}
                </div>
                <p className="text-3xl font-bold text-gray-800">{value}</p>
                <p className="mt-1 text-sm text-gray-500">{label}</p>
              </div>
            ))}
          </div>

          {/* Users table */}
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Recent Users</h2>
              <button className="rounded-lg bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100">
                View All
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    <th className="pb-3 pr-4">Name</th>
                    <th className="pb-3 pr-4">Email</th>
                    <th className="pb-3 pr-4">Role</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {recentUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50/50">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">
                            {user.name.charAt(0)}
                          </div>
                          <span className="font-medium text-gray-800">
                            {user.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-gray-500">{user.email}</td>
                      <td className="py-3 pr-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${roleColor[user.role]}`}
                        >
                          {user.role}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            user.isVerified
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {user.isVerified ? "Active" : "Pending"}
                        </span>
                      </td>
                      <td className="py-3 text-gray-500">
                        {user.createdAt.toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
