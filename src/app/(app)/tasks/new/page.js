import Link from "next/link";
import { requirePermission } from "@/lib/access";
import { listProjects } from "@/lib/pm-data";
import { listUsers } from "@/lib/data";
import { listTeams } from "@/lib/teams";
import { Card, EmptyState } from "@/components/ui";
import { CreateTaskForm } from "../task-forms";

export const metadata = { title: "New task · Finessse" };

export default async function NewTaskPage({ searchParams }) {
  const user = await requirePermission("task:create");
  const sp = await searchParams;

  const [projects, people, teams] = await Promise.all([
    listProjects({ user }),
    listUsers({ status: "active" }),
    listTeams(),
  ]);
  const usable = projects.filter((p) => p.teamIds.length && p.status !== "archived");

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
            Onboard a project with at least one team first.
          </EmptyState>
        ) : (
          <CreateTaskForm
            projects={usable}
            people={people}
            allTeams={teams}
            defaultProjectId={sp.project}
            canSchedule={user.can("task:schedule")}
            canAssign={user.can("task:assign")}
          />
        )}
      </Card>
    </div>
  );
}
