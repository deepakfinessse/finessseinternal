import { STATUS_LABEL, APPROVAL_LABEL, overdueDays } from "@/lib/pm-constants";
import { Chip } from "@/components/ui";

/* --------------------------------------------------------- division colour */

// Divisions are a dynamic, super-admin managed set (see src/lib/divisions.js),
// so colour and the task-code abbreviation are derived deterministically from
// the key rather than kept in a static map — new divisions just work.
const DIVISION_HUES = [
  "265 62% 63%", "35 82% 56%", "150 46% 50%", "197 71% 52%",
  "12 65% 58%", "330 55% 60%", "220 55% 58%", "95 40% 48%",
];

function hashSeed(key = "") {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h;
}

export function divisionHsl(key) {
  if (!key) return "220 8% 55%";
  return DIVISION_HUES[hashSeed(key) % DIVISION_HUES.length];
}

export function DivisionDot({ division, size = 7 }) {
  return (
    <span
      style={{ width: size, height: size, background: `hsl(${divisionHsl(division)})` }}
      className="inline-block shrink-0 rounded-full"
    />
  );
}

export function DivisionLabel({ division, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-dim">
      <DivisionDot division={division} />
      {label}
    </span>
  );
}

/** Deterministic display code, e.g. SEO-142 — used until real sequencing exists. */
export function taskCode(task) {
  const parts = String(task.division || "").split("-").filter(Boolean);
  const abbr = parts.length
    ? (parts.length === 1 ? parts[0].slice(0, 3) : parts.map((p) => p[0]).join("").slice(0, 3)).toUpperCase()
    : "TSK";
  const n = (parseInt(String(task.id).slice(-4), 16) % 900) + 100;
  return `${abbr}-${n}`;
}

/* ---------------------------------------------------------------- statuses */

const STATUS_STYLE = {
  open: { dot: "hsl(220 6% 55%)", text: "text-dim" },
  in_progress: { dot: "hsl(197 74% 55%)", text: "text-accent" },
  in_review: { dot: "hsl(43 82% 56%)", text: "text-caution" },
  blocked: { dot: "hsl(12 62% 58%)", text: "text-warn" },
  completed: { dot: "hsl(150 46% 50%)", text: "text-ok" },
};

export function StatusDot({ status, size = 7 }) {
  return (
    <span
      style={{ width: size, height: size, background: STATUS_STYLE[status]?.dot || "hsl(220 6% 55%)" }}
      className="inline-block shrink-0 rounded-full"
    />
  );
}

export function TaskStatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.open;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${s.text}`}>
      <StatusDot status={status} />
      {STATUS_LABEL[status] || status}
    </span>
  );
}

export function BlockerChip({ blocker }) {
  if (!blocker) return null;
  const kind = blocker.kind === "client_side" ? "CLIENT" : "INTERNAL";
  return <Chip tone="warn">Blocked · {kind}</Chip>;
}

export function PriorityChip({ priority }) {
  if (priority === "low" || priority === "medium") return null;
  return (
    <Chip tone={priority === "urgent" ? "warn" : "caution"}>
      {priority === "urgent" ? "Critical" : "High"}
    </Chip>
  );
}

export function ApprovalChip({ approval }) {
  if (!approval || approval === "none") return null;
  const tone = approval === "approved" ? "ok" : approval === "rejected" ? "warn" : "caution";
  return <Chip tone={tone}>{APPROVAL_LABEL[approval]}</Chip>;
}

export function OverdueTag({ show, iso }) {
  if (!show) return null;
  const days = iso ? overdueDays(iso) : 0;
  return (
    <span className="text-[12px] font-medium text-warn">
      {days > 0 ? `${days} day${days === 1 ? "" : "s"} overdue` : "Overdue"}
    </span>
  );
}

/* ------------------------------------------------------------ report visuals */

function rateColor(pct) {
  if (pct == null) return "var(--text-faint)";
  if (pct >= 80) return "var(--ok)";
  if (pct >= 60) return "var(--caution)";
  return "var(--warn)";
}

export function RingGauge({ pct = 0, size = 54, stroke = 5 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, pct)) / 100) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--line-strong)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={rateColor(pct)}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

/** Ring gauge with the percentage centred inside it. */
export function RingStat({ pct = 0, size = 46 }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <RingGauge pct={pct} size={size} stroke={4} />
      <span
        className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold tabular-nums"
        style={{ color: rateColor(pct) }}
      >
        {pct}%
      </span>
    </div>
  );
}

/** Tiny trend line. `values` may contain nulls (missing months). */
export function Sparkline({ values = [], width = 72, height = 22 }) {
  const pts = values
    .map((v, i) => ({ v, i }))
    .filter((p) => p.v != null);
  if (pts.length < 2) {
    return <span className="mono text-[9px] uppercase tracking-[0.1em] text-faint">no data</span>;
  }
  const max = 100;
  const min = Math.min(...pts.map((p) => p.v), 0);
  const span = Math.max(max - min, 1);
  const stepX = width / Math.max(values.length - 1, 1);
  const coords = pts.map((p) => {
    const x = p.i * stepX;
    const y = height - ((p.v - min) / span) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const trendUp = pts[pts.length - 1].v >= pts[0].v;
  return (
    <svg width={width} height={height} className="shrink-0 overflow-visible">
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke={trendUp ? "var(--ok)" : "var(--caution)"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={coords[coords.length - 1].split(",")[0]}
        cy={coords[coords.length - 1].split(",")[1]}
        r="1.8"
        fill={trendUp ? "var(--ok)" : "var(--caution)"}
      />
    </svg>
  );
}

export function RateBar({ pct, width = 96 }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-block h-1.5 overflow-hidden rounded-full bg-line-strong"
        style={{ width }}
      >
        <span
          className="block h-full rounded-full"
          style={{ width: `${pct ?? 0}%`, background: rateColor(pct) }}
        />
      </span>
      <span className="mono text-[11px]" style={{ color: rateColor(pct) }}>
        {pct == null ? "—" : `${pct}%`}
      </span>
    </span>
  );
}

/* keep the old export name working for any not-yet-restyled page */
export const PriorityBadge = PriorityChip;
export const DivisionTag = ({ label }) => (
  <span className="mono text-[10px] uppercase tracking-[0.08em] text-faint">{label}</span>
);
export const ApprovalTag = ApprovalChip;
