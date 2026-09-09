import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/access";
import { getRole, listUsers } from "@/lib/data";
import { Card, Badge } from "@/components/ui";
import { RoleForm } from "../role-form";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const r = await getRole(id).catch(() => null);
  return { title: `${r?.name || "Role"} · Finessse` };
}

export default async function EditRolePage({ params }) {
  const { id } = await params;
  const user = await requirePermission("role:read");
  const canEdit = user.can("role:update");

  let role;
  try {
    role = await getRole(id);
  } catch {
    notFound();
  }
  if (!role) notFound();

  const users = await listUsers({ roleId: id });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/settings/roles" className="text-sm text-gray hover:text-primary">
          ← Roles &amp; access
        </Link>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-heading">
          {role.name}
          {role.isSystem && <Badge tone="neutral">system</Badge>}
        </h1>
        <p className="text-sm text-gray">
          <code>{role.key}</code> · {users.length} member{users.length === 1 ? "" : "s"}
        </p>
      </div>

      <Card>
        {canEdit ? (
          <RoleForm role={role} canGrantSuper={user.can("*")} />
        ) : (
          <div className="text-sm">
            <p className="mb-2 text-gray">You can view this role but not edit it.</p>
            <div className="flex flex-wrap gap-1.5">
              {role.permissions.map((p) => (
                <code key={p} className="rounded bg-gray/15 px-1.5 py-0.5 text-xs">{p}</code>
              ))}
            </div>
          </div>
        )}
      </Card>

      {users.length > 0 && (
        <Card title="Members">
          <ul className="flex flex-col divide-y divide-gray/15 text-sm">
            {users.map((u) => (
              <li key={u.id} className="flex justify-between py-2">
                <Link href={`/team/${u.id}`} className="hover:text-primary">
                  {u.name || u.email}
                </Link>
                <span className="text-xs text-gray">{u.email}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
