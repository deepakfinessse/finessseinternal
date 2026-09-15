import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/access";
import { listTasks, taskStats, listProjectOptions } from "@/lib/pm-data";
import { listUsers } from "@/lib/data";
import { listDivisions } from "@/lib/divisions";
import { resolveTaskFilters, filterListArgs, FILTER_COOKIE } from "@/lib/task-filters";
import { PageHeader } from "@/components/ui";
import { DeliveryFilters } from "@/components/delivery-filters";
import { BoardClient } from "./board-client";

export const metadata = { title: "Board · Finessse" };

export default async function BoardPage({ searchParams }) {
  const user = await requireUser();
  if (!user.can("task:read") && !user.can("task:read:all")) redirect("/403");
  const sp = await searchParams;

  const canSeeAll = user.can("task:read:all") || user.can("*");
  const canDrag = user.can("task:transition") || user.can("task:approve");

  const cookieStore = await cookies();
  const filters = resolveTaskFilters({
    searchParams: sp,
    cookieValue: cookieStore.get(FILTER_COOKIE)?.value,
  });

  const [tasks, stats, people, projects, divisions] = await Promise.all([
    listTasks(user, filterListArgs(filters, user.id)),
    taskStats(user),
    canSeeAll ? listUsers({ status: "active" }) : [],
    user.can("project:read") ? listProjectOptions() : [],
    listDivisions(),
  ]);

  const sig = tasks.map((t) => `${t.id}:${t.status}`).sort().join("|");

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Delivery"
        title="Board"
        description="Drag a card between columns to move it through the lifecycle."
        actions={
          <div className="flex items-center gap-3 text-[12px] text-dim">
            <span>{stats.total} total</span>
            {stats.overdue > 0 && <span className="text-warn">{stats.overdue} overdue</span>}
          </div>
        }
      />

      <DeliveryFilters
        value={filters}
        projects={projects}
        people={people.map((p) => ({ id: p.id, name: p.name, email: p.email }))}
        divisions={divisions}
        canSeeAll={canSeeAll}
      />

      <BoardClient
        key={sig}
        tasks={tasks}
        canApprove={user.can("task:approve")}
        canDrag={canDrag}
      />
    </div>
  );
}
