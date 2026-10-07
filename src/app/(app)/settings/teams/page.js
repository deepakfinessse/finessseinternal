import { ObjectId } from "mongodb";
import { requirePermission } from "@/lib/access";
import { listTeamsWithMembers } from "@/lib/teams";
import { listUsers } from "@/lib/data";
import { collections } from "@/lib/db";
import { Card, Badge, EmptyState, AvatarStack } from "@/components/ui";
import { NewTeamForm, TeamRowForm, TeamMembersForm, DeleteTeamForm } from "./team-forms";

export const metadata = { title: "Teams · Finessse" };

export default async function TeamsSettingsPage() {
  await requirePermission("team:manage");
  const [teams, people, { projects, tasks }] = await Promise.all([
    listTeamsWithMembers(),
    listUsers({ status: "active" }),
    collections(),
  ]);

  const counts = await Promise.all(
    teams.map(async (t) => {
      const oid = new ObjectId(t.id);
      return {
        id: t.id,
        projects: await projects.countDocuments({ teamIds: oid }).catch(() => 0),
        tasks: await tasks.countDocuments({ teamId: oid }).catch(() => 0),
      };
    }),
  );
  const countById = new Map(counts.map((c) => [c.id, c]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-heading">Teams</h1>
        {/* <p className="text-sm text-gray">
          Teams replace divisions: a project picks the team(s) working on it, and tasks can only be
          assigned to people on those teams. Super-admin managed.
        </p> */}
      </div>

      <Card title="Add a team">
        <NewTeamForm />
      </Card>

      <Card title="Teams">
        {teams.length === 0 ? (
          <EmptyState title="No teams yet" />
        ) : (
          <ul className="flex flex-col divide-y divide-gray/15">
            {teams.map((t) => {
              const c = countById.get(t.id) || { projects: 0, tasks: 0 };
              const inUse = c.projects > 0 || c.tasks > 0;
              return (
                <li key={t.id} className="flex flex-col gap-2 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      {t.members.length > 0 && <AvatarStack people={t.members} size={22} />}
                      <div>
                        <span className="font-semibold">{t.name}</span>
                        <div className="text-xs text-gray">
                          {c.projects} project{c.projects === 1 ? "" : "s"} · {c.tasks} task{c.tasks === 1 ? "" : "s"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <TeamRowForm team={t} />
                      {inUse ? <Badge tone="neutral">in use</Badge> : <DeleteTeamForm id={t.id} />}
                    </div>
                  </div>
                  <TeamMembersForm team={t} people={people} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
