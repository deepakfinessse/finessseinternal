"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, inputClass } from "@/components/ui";
import { createTeam, updateTeam, updateTeamMembers, deleteTeam } from "@/lib/actions/teams";

export function NewTeamForm() {
  return (
    <ActionForm action={createTeam} successMessage="Team added." className="flex items-end gap-3">
      <Field label="Team name">
        <input name="name" className={inputClass} required minLength={2} maxLength={60} />
      </Field>
      <SubmitButton>Add team</SubmitButton>
    </ActionForm>
  );
}

export function TeamRowForm({ team }) {
  return (
    <ActionForm action={updateTeam} hidden={{ id: team.id }} className="flex items-center gap-2">
      <input
        name="name"
        defaultValue={team.name}
        className={`${inputClass} w-56`}
        required
        minLength={2}
        maxLength={60}
      />
      <SubmitButton variant="secondary">Save</SubmitButton>
    </ActionForm>
  );
}

export function TeamMembersForm({ team, people }) {
  const [open, setOpen] = useState(false);
  const memberIds = new Set(team.memberIds);
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="mt-2">
      <summary className="cursor-pointer text-[12px] font-semibold text-dim hover:text-text">
        {team.members.length} member{team.members.length === 1 ? "" : "s"} · manage
      </summary>
      <ActionForm
        action={updateTeamMembers}
        hidden={{ id: team.id }}
        successMessage="Members updated."
        className="mt-2 flex flex-col gap-2"
      >
        <div className="flex flex-wrap gap-2">
          {people.length === 0 && <span className="text-sm text-gray">No active people.</span>}
          {people.map((u) => (
            <label
              key={u.id}
              className="flex items-center gap-1.5 rounded-lg border border-gray/25 px-2.5 py-1 text-sm"
            >
              <input type="checkbox" name="memberIds" value={u.id} defaultChecked={memberIds.has(u.id)} />
              {u.name || u.email}
            </label>
          ))}
        </div>
        <SubmitButton variant="secondary" className="w-fit">Save members</SubmitButton>
      </ActionForm>
    </details>
  );
}

export function DeleteTeamForm({ id }) {
  return (
    <ActionForm action={deleteTeam} hidden={{ id }}>
      <SubmitButton variant="ghost">Delete</SubmitButton>
    </ActionForm>
  );
}
