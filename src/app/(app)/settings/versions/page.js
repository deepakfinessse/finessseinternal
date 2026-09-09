import { requirePermission } from "@/lib/access";
import { listVersions } from "@/lib/data";
import { Card, Badge, EmptyState, fmtDate } from "@/components/ui";
import { NewVersionForm, VersionRowForm, DeleteVersionForm } from "./version-forms";

export const metadata = { title: "Release versions · Finessse" };

export default async function VersionsSettingsPage() {
  await requirePermission("version:manage");
  const versions = await listVersions();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-heading">Release versions</h1>
        <p className="text-sm text-gray">
          Define the software releases that can be allocated to assignees. The default is
          auto-assigned to newly onboarded members.
        </p>
      </div>

      <Card title="Add a version">
        <NewVersionForm />
      </Card>

      <Card title="Versions">
        {versions.length === 0 ? (
          <EmptyState title="No versions yet" />
        ) : (
          <ul className="flex flex-col divide-y divide-gray/15">
            {versions.map((v) => (
              <li key={v.id} className="flex flex-col gap-2 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="font-semibold">{v.version}</span>{" "}
                    <span className="text-xs text-gray">{v.channel}</span>{" "}
                    {v.isDefault && <Badge tone="active">default</Badge>}
                    {!v.isActive && <Badge tone="neutral">inactive</Badge>}
                    <div className="text-xs text-gray">
                      released {fmtDate(v.releasedAt)} · {v.assignedCount} assigned
                    </div>
                  </div>
                  <DeleteVersionForm id={v.id} disabled={v.assignedCount > 0} />
                </div>
                {v.notes && <p className="text-sm text-gray">{v.notes}</p>}
                <VersionRowForm v={v} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
