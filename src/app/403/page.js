import Link from "next/link";

export const metadata = { title: "Access denied · Finessse" };

export default function ForbiddenPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-background p-6 text-center text-foreground">
      <h1 className="text-3xl font-heading">Access denied</h1>
      <p className="max-w-sm text-sm text-gray">
        Your role doesn&apos;t grant permission for that page. If you think this is a
        mistake, ask a workspace administrator to adjust your access.
      </p>
      <Link
        href="/dashboard"
        className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
