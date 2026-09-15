import { requirePermission } from "@/lib/access";
import { listDivisions } from "@/lib/divisions";
import { collections } from "@/lib/db";
import { Card, Badge, EmptyState } from "@/components/ui";
import { DivisionDot } from "@/components/pm-ui";
import { NewDivisionForm, DivisionRowForm, DeleteDivisionForm } from "./division-forms";

export const metadata = { title: "Divisions · Finessse" };

export default async function DivisionsSettingsPage() {
  await requirePermission("division:manage");
  const [divisions, { projects, tasks }] = await Promise.all([
    listDivisions(),
    collections(),
  ]);

  const counts = await Promise.all(
    divisions.map(async (d) => ({
      key: d.key,
      projects: await projects.countDocuments({ divisions: d.key }),
      tasks: await tasks.countDocuments({ division: d.key }),
    })),
  );
  const countByKey = new Map(counts.map((c) => [c.key, c]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-heading">Divisions</h1>
        <p className="text-sm text-gray">
          Agency divisions that projects route into and tasks are assigned under. Super-admin managed.
        </p>
      </div>

      <Card title="Add a division">
        <NewDivisionForm />
      </Card>

      <Card title="Divisions">
        {divisions.length === 0 ? (
          <EmptyState title="No divisions yet" />
        ) : (
          <ul className="flex flex-col divide-y divide-gray/15">
            {divisions.map((d) => {
              const c = countByKey.get(d.key) || { projects: 0, tasks: 0 };
              const inUse = c.projects > 0 || c.tasks > 0;
              return (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-2.5">
                    <DivisionDot division={d.key} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{d.label}</span>
                        <code className="text-xs text-gray">{d.key}</code>
                      </div>
                      <div className="text-xs text-gray">
                        {c.projects} project{c.projects === 1 ? "" : "s"} · {c.tasks} task{c.tasks === 1 ? "" : "s"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <DivisionRowForm division={d} />
                    {inUse ? (
                      <Badge tone="neutral">in use</Badge>
                    ) : (
                      <DeleteDivisionForm id={d.id} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
