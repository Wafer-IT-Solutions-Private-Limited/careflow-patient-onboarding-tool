import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import LogoutButton from "@/components/LogoutButton";

export default async function PatientPage() {
  const session = await getSession();
  if (!session || session.role !== "PATIENT") redirect("/login");

  const stats = [
    { label: "Upcoming Visits", value: "2", icon: "📅", color: "bg-teal-50 text-teal-600" },
    { label: "Prescriptions", value: "5", icon: "💊", color: "bg-purple-50 text-purple-600" },
    { label: "Lab Reports", value: "3", icon: "🔬", color: "bg-blue-50 text-blue-600" },
    { label: "Health Score", value: "87%", icon: "❤️", color: "bg-rose-50 text-rose-600" },
  ];

  const appointments = [
    { date: "Jul 28, 2025", doctor: "Dr. Sarah Johnson", dept: "Cardiology", status: "Upcoming" },
    { date: "Aug 5, 2025", doctor: "Dr. Michael Lee", dept: "General", status: "Upcoming" },
    { date: "Jun 10, 2025", doctor: "Dr. Sarah Johnson", dept: "Cardiology", status: "Completed" },
  ];

  const prescriptions = [
    { name: "Aspirin 75mg", frequency: "Once daily", duration: "30 days" },
    { name: "Lisinopril 10mg", frequency: "Once daily", duration: "60 days" },
    { name: "Metformin 500mg", frequency: "Twice daily", duration: "90 days" },
  ];

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 w-64 bg-white shadow-sm">
        <div className="flex h-16 items-center gap-3 border-b px-6">
          <span className="text-xl font-bold text-gray-800">MeFy</span>
          <span className="rounded-md bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-700">
            Patient
          </span>
        </div>
        <nav className="mt-6 px-4 space-y-1">
          {[
            { icon: "🏠", label: "Dashboard", active: true },
            { icon: "📅", label: "My Appointments" },
            { icon: "💊", label: "Prescriptions" },
            { icon: "🔬", label: "Lab Reports" },
            { icon: "📋", label: "Medical History" },
            { icon: "👨‍⚕️", label: "Find a Doctor" },
            { icon: "⚙️", label: "Settings" },
          ].map(({ icon, label, active }) => (
            <button
              key={label}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-teal-50 text-teal-700"
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
              Hello, {session.name} 👋
            </h1>
            <p className="text-xs text-gray-500">Your health dashboard</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-100 text-sm font-bold text-teal-700">
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
                <p className="text-2xl font-bold text-gray-800">{value}</p>
                <p className="mt-1 text-sm text-gray-500">{label}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Appointments */}
            <div className="col-span-2 rounded-2xl bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-semibold text-gray-800">My Appointments</h2>
                <button className="rounded-lg bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-100">
                  + Book New
                </button>
              </div>
              <div className="space-y-3">
                {appointments.map(({ date, doctor, dept, status }) => (
                  <div
                    key={date + doctor}
                    className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-100 text-lg">
                        🩺
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {doctor}
                        </p>
                        <p className="text-xs text-gray-500">
                          {date} · {dept}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        status === "Upcoming"
                          ? "bg-teal-100 text-teal-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Current prescriptions */}
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 font-semibold text-gray-800">
                Active Prescriptions
              </h2>
              <div className="space-y-3">
                {prescriptions.map(({ name, frequency, duration }) => (
                  <div
                    key={name}
                    className="rounded-xl border border-gray-100 p-3"
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 text-lg">💊</span>
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {name}
                        </p>
                        <p className="text-xs text-gray-500">{frequency}</p>
                        <p className="text-xs text-teal-600">{duration}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Health score */}
              <div className="mt-6 rounded-xl bg-gradient-to-r from-teal-50 to-cyan-50 p-4">
                <p className="text-xs font-medium text-gray-600">
                  Overall Health Score
                </p>
                <p className="mt-1 text-3xl font-bold text-teal-700">87%</p>
                <div className="mt-2 h-2 w-full rounded-full bg-teal-100">
                  <div
                    className="h-2 rounded-full bg-teal-500"
                    style={{ width: "87%" }}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">Good — Keep it up!</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
