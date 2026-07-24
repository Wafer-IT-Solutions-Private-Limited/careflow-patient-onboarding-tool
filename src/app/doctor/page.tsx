import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import LogoutButton from "@/components/LogoutButton";

export default async function DoctorPage() {
  const session = await getSession();
  if (!session || session.role !== "DOCTOR") redirect("/login");

  const stats = [
    { label: "Today's Patients", value: "12", icon: "👥", color: "bg-blue-50 text-blue-600" },
    { label: "Appointments", value: "8", icon: "📅", color: "bg-purple-50 text-purple-600" },
    { label: "Pending Reports", value: "3", icon: "📋", color: "bg-amber-50 text-amber-600" },
    { label: "Avg. Rating", value: "4.9", icon: "⭐", color: "bg-green-50 text-green-600" },
  ];

  const appointments = [
    { time: "09:00 AM", patient: "Alice Johnson", type: "Check-up", status: "Confirmed" },
    { time: "10:30 AM", patient: "Bob Smith", type: "Follow-up", status: "Confirmed" },
    { time: "12:00 PM", patient: "Carol White", type: "Consultation", status: "Pending" },
    { time: "02:00 PM", patient: "David Brown", type: "Review", status: "Confirmed" },
    { time: "03:30 PM", patient: "Eva Martinez", type: "Check-up", status: "Pending" },
  ];

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 w-64 bg-white shadow-sm">
        <div className="flex h-16 items-center gap-3 border-b px-6">
          <span className="text-xl font-bold text-gray-800">MeFy</span>
          <span className="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
            Doctor
          </span>
        </div>
        <nav className="mt-6 px-4 space-y-1">
          {[
            { icon: "🏠", label: "Dashboard", active: true },
            { icon: "📅", label: "Appointments" },
            { icon: "👥", label: "My Patients" },
            { icon: "📋", label: "Medical Records" },
            { icon: "💊", label: "Prescriptions" },
            { icon: "📊", label: "Reports" },
            { icon: "⚙️", label: "Settings" },
          ].map(({ icon, label, active }) => (
            <button
              key={label}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <main className="ml-64 flex-1">
        {/* Header */}
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-white px-8 shadow-sm">
          <div>
            <h1 className="text-lg font-semibold text-gray-800">
              Good morning, {session.name} 👋
            </h1>
            <p className="text-xs text-gray-500">{new Date().toDateString()}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
              {session.name.charAt(0)}
            </div>
            <LogoutButton />
          </div>
        </header>

        <div className="p-8">
          {/* Stats */}
          <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {stats.map(({ label, value, icon, color }) => (
              <div
                key={label}
                className="rounded-2xl bg-white p-5 shadow-sm"
              >
                <div className={`mb-3 inline-flex rounded-xl p-2.5 text-xl ${color}`}>
                  {icon}
                </div>
                <p className="text-2xl font-bold text-gray-800">{value}</p>
                <p className="mt-1 text-sm text-gray-500">{label}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Today's appointments */}
            <div className="col-span-2 rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 font-semibold text-gray-800">
                Today&apos;s Appointments
              </h2>
              <div className="space-y-3">
                {appointments.map(({ time, patient, type, status }) => (
                  <div
                    key={time}
                    className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                        {patient.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {patient}
                        </p>
                        <p className="text-xs text-gray-500">
                          {time} · {type}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        status === "Confirmed"
                          ? "bg-green-100 text-green-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Profile card */}
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 font-semibold text-gray-800">
                Doctor Profile
              </h2>
              <div className="flex flex-col items-center text-center">
                <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-2xl font-bold text-blue-700">
                  {session.name.charAt(0)}
                </div>
                <p className="font-semibold text-gray-800">{session.name}</p>
                <p className="text-sm text-gray-500">{session.email}</p>
                <span className="mt-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                  Cardiologist
                </span>

                <div className="mt-6 w-full space-y-2 text-left">
                  {[
                    { label: "License", value: "LIC-2024-001" },
                    { label: "Department", value: "Cardiology" },
                    { label: "Experience", value: "8 years" },
                    { label: "Status", value: "✅ Approved" },
                  ].map(({ label, value }) => (
                    <div
                      key={label}
                      className="flex justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs"
                    >
                      <span className="text-gray-500">{label}</span>
                      <span className="font-medium text-gray-700">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
