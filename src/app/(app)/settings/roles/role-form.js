"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, inputClass } from "@/components/ui";
import { createRole, updateRole, deleteRole } from "@/lib/actions/roles";
import { PERMISSION_CATALOG, PERMISSION_GROUPS } from "@/lib/rbac-catalog";

const GROUP_WILDCARDS = {
  Assignees: "assignee:*",
  Onboarding: "onboarding:*",
  Sessions: "session:*",
  Versions: "version:*",
  "Access control": "role:*",
};

export function RoleForm({ role, canGrantSuper }) {
  const editing = !!role;
  const locked = role?.key === "super-admin";
  const [granted, setGranted] = useState(new Set(role?.permissions || []));

  const toggle = (key) => {
    setGranted((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const effectiveHas = (permKey) => {
    if (granted.has("*")) return true;
    for (const g of granted) {
      if (g === permKey) return true;
      if (g.endsWith(":*") && permKey.startsWith(g.slice(0, -1))) return true;
    }
    return false;
  };

  return (
    <ActionForm
      action={editing ? updateRole : createRole}
      hidden={editing ? { id: role.id } : {}}
      successMessage={editing ? "Role saved." : "Role created."}
      className="flex flex-col gap-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Role name" hint={editing && role.isSystem ? "System role — name locked" : "The key is derived from this"}>
          <input
            name="name"
            defaultValue={role?.name || ""}
            className={inputClass}
            required
            readOnly={editing && role.isSystem}
          />
        </Field>
        <Field label="Priority" hint="Higher wins when merging role metadata">
          <input
            name="priority"
            type="number"
            min="0"
            max="999"
            defaultValue={role?.priority ?? 0}
            className={inputClass}
            readOnly={locked}
          />
        </Field>
      </div>
      <Field label="Description">
        <input name="description" defaultValue={role?.description || ""} className={inputClass} />
      </Field>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium">Permissions</span>
          {canGrantSuper && (
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                name="permissions"
                value="*"
                checked={granted.has("*")}
                onChange={() => toggle("*")}
                disabled={locked}
              />
              Grant <code>*</code> (full access)
            </label>
          )}
        </div>

        {locked && (
          <p className="mb-2 rounded-lg border border-gray/25 bg-gray/5 px-3 py-2 text-xs text-gray">
            The Super Admin role always has <code>*</code> and cannot be edited.
          </p>
        )}

        <div className="flex flex-col gap-4">
          {PERMISSION_GROUPS.map((group) => {
            const wildcard = GROUP_WILDCARDS[group];
            return (
              <fieldset key={group} className="rounded-xl border border-gray/20 p-3" disabled={locked || granted.has("*")}>
                <legend className="flex items-center gap-2 px-1 text-sm font-semibold">
                  {group}
                  {wildcard && (
                    <label className="flex items-center gap-1 text-xs font-normal text-gray">
                      <input
                        type="checkbox"
                        name="permissions"
                        value={wildcard}
                        checked={granted.has(wildcard)}
                        onChange={() => toggle(wildcard)}
                      />
                      all
                    </label>
                  )}
                </legend>
                <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
                  {PERMISSION_CATALOG.filter((p) => p.group === group).map((p) => {
                    const covered = effectiveHas(p.key) && !granted.has(p.key);
                    return (
                      <label key={p.key} className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="permissions"
                          value={p.key}
                          checked={granted.has(p.key) || covered}
                          onChange={() => toggle(p.key)}
                          disabled={covered}
                          className="mt-1"
                        />
                        <span>
                          <code className="text-xs">{p.key}</code>
                          <span className="block text-xs text-gray">{p.description}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
        </div>
      </div>

      {!locked && <SubmitButton>{editing ? "Save role" : "Create role"}</SubmitButton>}
    </ActionForm>
  );
}

export function DeleteRoleButton({ id }) {
  return (
    <ActionForm action={deleteRole} hidden={{ id }} onDone={() => {}}>
      <SubmitButton variant="ghost">Delete</SubmitButton>
    </ActionForm>
  );
}
