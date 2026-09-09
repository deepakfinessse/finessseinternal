"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { inputClass } from "@/components/ui";
import { updateOnboardingConfig } from "@/lib/actions/onboarding";

const slug = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function StepsEditor({ initialSteps }) {
  const [steps, setSteps] = useState(
    initialSteps.length
      ? initialSteps
      : [{ key: "profile", title: "Complete profile", description: "", url: "", auto: false }],
  );

  const update = (i, patch) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const remove = (i) => setSteps((prev) => prev.filter((_, idx) => idx !== i));
  const move = (i, dir) =>
    setSteps((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const add = () =>
    setSteps((prev) => [
      ...prev,
      { key: `step-${prev.length + 1}`, title: "", description: "", url: "", auto: false },
    ]);

  const cleaned = steps
    .map((s, i) => ({
      key: slug(s.key || s.title) || `step-${i + 1}`,
      title: s.title || "",
      description: s.description || "",
      url: s.url || "",
      auto: !!s.auto,
    }))
    .filter((s) => s.title);

  return (
    <ActionForm
      action={updateOnboardingConfig}
      successMessage="Checklist saved."
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="steps" value={JSON.stringify(cleaned)} />

      <ol className="flex flex-col gap-3">
        {steps.map((s, i) => (
          <li key={i} className="rounded-xl border border-gray/20 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray">Step {i + 1}</span>
              <div className="flex gap-1 text-xs">
                <button type="button" onClick={() => move(i, -1)} className="rounded border border-gray/30 px-1.5">↑</button>
                <button type="button" onClick={() => move(i, 1)} className="rounded border border-gray/30 px-1.5">↓</button>
                <button type="button" onClick={() => remove(i)} className="rounded border border-gray/30 px-1.5">✕</button>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={s.title}
                onChange={(e) => update(i, { title: e.target.value })}
                placeholder="Step title"
                className={inputClass}
              />
              <input
                value={s.key}
                onChange={(e) => update(i, { key: e.target.value })}
                placeholder="key (auto)"
                className={inputClass}
              />
            </div>
            <input
              value={s.description}
              onChange={(e) => update(i, { description: e.target.value })}
              placeholder="Description"
              className={`${inputClass} mt-2`}
            />
            <div className="mt-2 flex items-center gap-3">
              <input
                value={s.url}
                onChange={(e) => update(i, { url: e.target.value })}
                placeholder="Resource URL (optional)"
                className={inputClass}
              />
              <label className="flex shrink-0 items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={s.auto}
                  onChange={(e) => update(i, { auto: e.target.checked })}
                />
                auto
              </label>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={add}
          className="rounded-lg border border-gray/30 px-3 py-2 text-sm font-semibold hover:border-primary"
        >
          Add step
        </button>
        <SubmitButton>Save checklist</SubmitButton>
      </div>
    </ActionForm>
  );
}
