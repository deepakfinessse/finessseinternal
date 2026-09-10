"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { DIVISIONS } from "@/lib/pm-constants";
import {
  FILTER_COOKIE,
  TASK_FILTER_KEYS,
  serializeFilters,
  filterCount,
} from "@/lib/task-filters";
import { Icon } from "@/components/icons";

const PRIORITY_OPTS = [
  { key: "urgent", label: "Critical" },
  { key: "high", label: "High" },
  { key: "medium", label: "Medium" },
  { key: "low", label: "Low" },
];
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

// Module scope so the React Compiler doesn't treat the `document.cookie` write
// as a render-time mutation.
function setFilterCookie(serialized) {
  try {
    document.cookie = serialized
      ? `${FILTER_COOKIE}=${encodeURIComponent(serialized)}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`
      : `${FILTER_COOKIE}=; path=/; max-age=0; samesite=lax`;
  } catch {}
}

function Pill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors ${
        active
          ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-text"
          : "border-line-strong text-dim hover:text-text"
      }`}
    >
      {children}
      {active && <Icon name="check" size={11} strokeWidth={2.6} />}
    </button>
  );
}

function Section({ label, children }) {
  return (
    <div>
      <div className="mb-1.5 mono text-[9px] uppercase tracking-[0.14em] text-faint">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

/**
 * `value` is the server-resolved filter object (URL params ∪ pm_filters cookie).
 * On change we write the cookie and update the URL, keeping any view-specific
 * params (by / range / view) intact.
 */
export function DeliveryFilters({
  value,
  projects = [],
  people = [],
  canSeeAll = false,
  showSearch = false,
  searchPlaceholder = "Search…",
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const advCount = value.project.length + value.assignee.length + value.priority.length + value.division.length;
  const [open, setOpen] = useState(advCount > 0);

  const persist = (f) => {
    const s = serializeFilters(f);
    setFilterCookie(s);
    // preserve view-specific params (by/range/view/...)
    const params = new URLSearchParams(sp.toString());
    for (const k of TASK_FILTER_KEYS) params.delete(k);
    for (const [k, v] of new URLSearchParams(s)) params.set(k, v);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const toggleBool = (k) => persist({ ...value, [k]: !value[k] });
  const toggleIn = (k, v) => {
    const set = new Set(value[k]);
    set.has(v) ? set.delete(v) : set.add(v);
    persist({ ...value, [k]: [...set] });
  };
  const clearAll = () =>
    persist({ mine: false, overdue: false, blocked: false, project: [], assignee: [], priority: [], division: [], q: "" });

  const projName = (id) => projects.find((p) => p.id === id)?.name || "Project";
  const personName = (id) => {
    const u = people.find((p) => p.id === id);
    return u ? (u.name || u.email || "Assignee") : "Assignee";
  };
  const divName = (k) => DIVISIONS.find((d) => d.key === k)?.label || k;
  const prioName = (k) => PRIORITY_OPTS.find((p) => p.key === k)?.label || k;

  const chips = [
    ...value.project.map((v) => ({ k: "project", v, label: projName(v) })),
    ...value.assignee.map((v) => ({ k: "assignee", v, label: personName(v) })),
    ...value.priority.map((v) => ({ k: "priority", v, label: prioName(v) })),
    ...value.division.map((v) => ({ k: "division", v, label: divName(v) })),
  ];
  const anyActive = filterCount(value) > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Pill active={value.mine} onClick={() => toggleBool("mine")}>My work</Pill>
        <Pill active={value.overdue} onClick={() => toggleBool("overdue")}>Overdue</Pill>
        <Pill active={value.blocked} onClick={() => toggleBool("blocked")}>Blocked</Pill>
        {showSearch && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              persist({ ...value, q: new FormData(e.currentTarget).get("q").toString().trim() });
            }}
            className="relative"
          >
            <Icon
              name="search"
              size={13}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
            />
            <input
              name="q"
              defaultValue={value.q}
              placeholder={searchPlaceholder}
              className="w-52 rounded-full border border-line-strong bg-surface py-1 pl-7 pr-3 text-[12px] outline-none placeholder:text-faint focus:border-line"
            />
          </form>
        )}
        {anyActive && (
          <button type="button" onClick={clearAll} className="text-[12px] text-faint hover:text-text">
            Clear all
          </button>
        )}
        <span className="ml-auto flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-faint">
          {anyActive && <span className="mono">shared across delivery views</span>}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-[9px] border border-line px-2 py-1 text-dim hover:text-text"
          >
            <Icon name="filter" size={13} />
            {advCount > 0 && (
              <span className="rounded-full bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] px-1.5 text-[10px] font-semibold text-text">
                {advCount}
              </span>
            )}
            <Icon name={open ? "chevronDown" : "chevron"} size={13} />
          </button>
        </span>
      </div>

      {open && (
        <div className="flex flex-col gap-4 rounded-[12px] border border-line bg-surface-2/40 p-4">
          <Section label="Project">
            {projects.length === 0 && <span className="text-[12px] text-faint">No projects</span>}
            {projects.map((p) => (
              <Pill key={p.id} active={value.project.includes(p.id)} onClick={() => toggleIn("project", p.id)}>
                {p.name}
              </Pill>
            ))}
          </Section>

          {canSeeAll && people.length > 0 && (
            <Section label="Assignee">
              {people.map((u) => (
                <Pill key={u.id} active={value.assignee.includes(u.id)} onClick={() => toggleIn("assignee", u.id)}>
                  {(u.name || u.email).split(" ")[0]}
                </Pill>
              ))}
            </Section>
          )}

          <Section label="Priority">
            {PRIORITY_OPTS.map((p) => (
              <Pill key={p.key} active={value.priority.includes(p.key)} onClick={() => toggleIn("priority", p.key)}>
                {p.label}
              </Pill>
            ))}
          </Section>

          <Section label="Division">
            {DIVISIONS.map((d) => (
              <Pill key={d.key} active={value.division.includes(d.key)} onClick={() => toggleIn("division", d.key)}>
                {d.label}
              </Pill>
            ))}
          </Section>
        </div>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <button
              key={`${c.k}:${c.v}`}
              type="button"
              onClick={() => toggleIn(c.k, c.v)}
              className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface px-2.5 py-1 text-[12px] font-medium transition-colors hover:border-warn hover:text-warn"
            >
              {c.label}
              <Icon name="plus" size={11} strokeWidth={2.6} className="rotate-45" />
            </button>
          ))}
          <button type="button" onClick={clearAll} className="text-[12px] text-faint hover:text-text">
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
