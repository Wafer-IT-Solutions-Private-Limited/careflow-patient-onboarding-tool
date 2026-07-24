import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-center">
      <div className="mb-6 text-7xl">🚫</div>
      <h1 className="mb-2 text-3xl font-bold text-gray-800">Access Denied</h1>
      <p className="mb-8 max-w-sm text-gray-500">
        You don&apos;t have permission to view this page. Please log in with the
        correct account.
      </p>
      <Link
        href="/login"
        className="rounded-full px-8 py-3 text-sm font-semibold text-white shadow-md transition hover:opacity-90"
        style={{
          background: "linear-gradient(90deg, #e85d8a 0%, #f47c60 100%)",
        }}
      >
        Back to Login
      </Link>
    </div>
  );
}
