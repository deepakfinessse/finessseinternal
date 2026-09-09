import Link from "next/link";
import { requireUser } from "@/lib/access";
import { touchSession } from "@/lib/session-tracking";
import { SidebarNav } from "@/components/sidebar-nav";
import { signOut } from "@/auth";

export default async function AppLayout({ children }) {
  const user = await requireUser();
  await touchSession();

  const can = (k) => user.can(k);

  const groups = [
    {
      label: "Workspace",
      items: [
        { href: "/dashboard", label: "Dashboard" },
        can("assignee:read") && { href: "/team", label: "Assignees" },
        (can("assignee:invite") || can("onboarding:manage")) && {
          href: "/onboarding",
          label: "Onboarding",
        },
        can("session:read") && { href: "/sessions", label: "Sessions & Versions" },
        { href: "/profile", label: "My profile" },
      ].filter(Boolean),
    },
    {
      label: "Administration",
      items: [
        can("role:read") && { href: "/settings/roles", label: "Roles & Access" },
        can("version:manage") && { href: "/settings/versions", label: "Release versions" },
        can("onboarding:manage") && {
          href: "/settings/onboarding",
          label: "Onboarding steps",
        },
        can("audit:read") && { href: "/audit", label: "Audit log" },
      ].filter(Boolean),
    },
  ].filter((g) => g.items.length);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 p-4 md:p-6">
      <aside className="hidden w-60 shrink-0 flex-col justify-between md:flex">
        <div>
          <Link href="/dashboard" className="mb-6 block px-3 text-xl font-heading">
            Finessse
          </Link>
          <SidebarNav groups={groups} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="mb-6 flex items-center justify-between gap-4 border-b border-gray/20 pb-4">
          <div className="md:hidden text-lg font-heading">Finessse</div>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-gray sm:inline">{user.email}</span>
            <span className="rounded-full bg-gray/15 px-2 py-0.5 text-xs font-semibold">
              {user.roleKeys[0] || "no role"}
            </span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/signin" });
              }}
            >
              <button
                type="submit"
                className="rounded-lg border border-gray/30 px-3 py-1.5 font-semibold hover:border-primary hover:text-primary"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
