import Link from "next/link";
import { requirePermission } from "@/lib/access";
import { Card } from "@/components/ui";
import { RoleForm } from "../role-form";

export const metadata = { title: "New role · Finessse" };

export default async function NewRolePage() {
  const user = await requirePermission("role:create");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/settings/roles" className="text-sm text-gray hover:text-primary">
          ← Roles &amp; access
        </Link>
        <h1 className="mt-2 text-2xl font-heading">New role</h1>
      </div>
      <Card>
        <RoleForm canGrantSuper={user.can("*")} />
      </Card>
    </div>
  );
}
