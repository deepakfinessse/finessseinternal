import Link from "next/link";
import { requireUser } from "@/lib/access";
import { touchSession } from "@/lib/session-tracking";
import { taskStats } from "@/lib/pm-data";
import { unreadChatCount } from "@/lib/chat";
import { SidebarNav } from "@/components/sidebar-nav";
import { Topbar } from "@/components/topbar";
import { Avatar } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Logo } from "@/components/logo";
import ThemeToggle from "@/app/theme-toggle";
import { signOut } from "@/auth";

export default async function AppLayout({ children }) {
  const user = await requireUser();
  await touchSession();

  const can = (k) => user.can(k);
  const canTasks = can("task:read") || can("task:read:all");
  const [stats, chatUnread] = await Promise.all([
    canTasks ? taskStats(user) : null,
    unreadChatCount(user.id),
  ]);

  const groups = [
    {
      label: "Delivery",
      items: [
        { href: "/dashboard", label: "Pulse", icon: "pulse" },
        canTasks && { href: "/tasks", label: "Board", icon: "board" },
        canTasks && { href: "/timeline", label: "Timeline", icon: "timeline" },
        canTasks && { href: "/heatmap", label: "Heatmap", icon: "heatmap" },
        can("project:read") && { href: "/projects", label: "Projects", icon: "projects" },
      ].filter(Boolean),
    },
    {
      label: "People",
      items: [
        can("assignee:read") && { href: "/team", label: "People", icon: "people" },
        { href: "/chat", label: "Chat", icon: "comment", badge: chatUnread || undefined },
        (can("assignee:invite") || can("onboarding:manage")) && {
          href: "/onboarding",
          label: "Onboarding",
          icon: "campaigns",
        },
        can("session:read") && { href: "/sessions", label: "Sessions", icon: "tools" },
        { href: "/profile", label: "My profile", icon: "people" },
      ].filter(Boolean),
    },
    {
      label: "Admin",
      items: [
        can("analytics:read") && { href: "/reports", label: "Reports", icon: "reports" },
        can("analytics:read") && { href: "/analytics", label: "Intelligence", icon: "intelligence" },
        can("role:read") && { href: "/settings/roles", label: "Roles & Access", icon: "tools" },
        can("division:manage") && { href: "/settings/divisions", label: "Divisions", icon: "tools" },
        // can("version:manage") && { href: "/settings/versions", label: "Releases", icon: "reports" },
        can("onboarding:manage") && { href: "/settings/onboarding", label: "Onboarding steps", icon: "campaigns" },
        can("audit:read") && { href: "/audit", label: "Audit log", icon: "reports" },
      ].filter(Boolean),
    },
  ].filter((g) => g.items.length);

  return (
    <div className="flex min-h-screen w-full">
      <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col border-r border-line bg-bg md:flex">
        <div className="flex flex-col gap-1 px-4 py-4">
          <Link href="/dashboard" aria-label="Finessse Interactive — home">
            <Logo className="h-10 w-auto text-text" />
          </Link>
          {/* <span className="mono pl-0.5 text-[9px] uppercase tracking-[0.16em] text-faint">
            Project Ops
          </span> */}
        </div>

        <div className="flex-1 overflow-y-auto px-2.5 pb-4">
          <SidebarNav groups={groups} />
        </div>

        <div className="border-t border-line p-3">
          {stats && stats.overdue > 0 && (
            <Link
              href="/tasks?overdue=1"
              className="mb-3 flex items-center gap-2.5 rounded-[11px] border border-line bg-surface p-2.5 transition-colors hover:border-line-strong"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-warn-bg text-warn">
                <Icon name="clock" size={15} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold leading-tight text-warn">
                  {stats.overdue} overdue
                </span>
                <span className="mono block text-[9px] uppercase tracking-[0.13em] text-faint">
                  Needs attention
                </span>
              </span>
            </Link>
          )}

          <div className="flex items-center gap-2">
            <Avatar name={user.name} email={user.email} src={user.image} size={30} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-semibold leading-tight">
                {user.name || user.email}
              </div>
              <div className="mono truncate text-[9px] uppercase tracking-[0.13em] text-faint">
                {user.roleKeys[0] || "no role"}
              </div>
            </div>
            <ThemeToggle />
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/signin" });
              }}
            >
              <button
                type="submit"
                title="Sign out"
                className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-line text-dim transition-colors hover:border-line-strong hover:text-text"
              >
                <Icon name="logout" size={15} />
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar canCreateTask={can("task:create")} />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
