import Link from "next/link";
import { requirePermission } from "@/lib/access";
import { listProjects } from "@/lib/pm-data";
import { listUsers } from "@/lib/data";
import { listTeams, teamIdsForUser } from "@/lib/teams";
import { Card, EmptyState } from "@/components/ui";
import { CreateTaskForm } from "../task-forms";

export const metadata = { title: "New task · Finessse" };

export default async function NewTaskPage({ searchParams }) {
  const user = await requirePermission("task:create");
  const sp = await searchParams;

  // Without task:assign:all (e.g. Manager), work is limited to your own
  // team(s) — you can't create or assign tasks for a team you're not on.
  const restrictToTeamIds =
    user.can("task:assign:all") || user.can("*") ? null : await teamIdsForUser(user.id);

  const [allProjects, people, teams] = await Promise.all([
    listProjects({ user }),
    listUsers({ status: "active" }),
    listTeams(),
  ]);
  const usable = allProjects.filter(
    (p) =>
      p.teamIds.length &&
      p.status !== "archived" &&
      (!restrictToTeamIds || p.teamIds.some((id) => restrictToTeamIds.includes(id))),
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/tasks" className="text-sm text-gray hover:text-primary">
          ← Tasks
        </Link>
        <h1 className="mt-2 text-2xl font-heading">Create task</h1>
        <p className="text-sm text-gray">Section 3 — task entity &amp; data fields.</p>
      </div>

      <Card>
        {usable.length === 0 ? (
          <EmptyState title="No eligible projects">
            {restrictToTeamIds
              ? "No project has a team you're on yet — ask an admin to add you to one."
              : "Onboard a project with at least one team first."}
          </EmptyState>
        ) : (
          <CreateTaskForm
            projects={usable}
            people={people}
            allTeams={teams}
            restrictToTeamIds={restrictToTeamIds}
            defaultProjectId={sp.project}
            canSchedule={user.can("task:schedule")}
            canAssign={user.can("task:assign")}
          />
        )}
      </Card>
    </div>
  );
}
