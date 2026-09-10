import Link from "next/link";

/* ------------------------------------------------------------------ layout */

export function Card({ title, description, action, children, className = "", bodyClass = "" }) {
  return (
    <section className={`card p-5 ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && (
              <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
            )}
            {description && <p className="mt-1 text-[13px] text-dim">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{title}</h1>
        {description && <p className="mt-1 text-[13px] text-dim">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionLabel({ children, className = "" }) {
  return <div className={`eyebrow ${className}`}>{children}</div>;
}

export function Divider({ className = "" }) {
  return <div className={`h-px w-full bg-line ${className}`} />;
}

/* ------------------------------------------------------------------ badges */

const TONES = {
  neutral: "bg-surface-3 text-dim",
  active: "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[color-mix(in_srgb,var(--accent)_92%,var(--text))]",
  accepted: "bg-ok-bg text-ok",
  ok: "bg-ok-bg text-ok",
  pending: "bg-caution-bg text-caution",
  invited: "bg-caution-bg text-caution",
  suspended: "bg-warn-bg text-warn",
  warn: "bg-warn-bg text-warn",
  expired: "bg-surface-3 text-faint",
  revoked: "bg-surface-3 text-faint",
  deactivated: "bg-surface-3 text-faint",
};

export function Badge({ children, tone = "neutral", className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[11px] font-semibold ${TONES[tone] || TONES.neutral} ${className}`}
    >
      {children}
    </span>
  );
}

/** Uppercase mono chip — task codes, division labels, status flags. */
export function Chip({ children, tone = "neutral", className = "" }) {
  const t = {
    neutral: "border-line text-faint",
    warn: "border-[color-mix(in_srgb,var(--warn)_45%,transparent)] text-warn bg-warn-bg",
    caution: "border-[color-mix(in_srgb,var(--caution)_45%,transparent)] text-caution bg-caution-bg",
    ok: "border-[color-mix(in_srgb,var(--ok)_40%,transparent)] text-ok bg-ok-bg",
    accent: "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-accent",
  }[tone];
  return (
    <span
      className={`mono inline-flex items-center gap-1 rounded-md border px-1.5 py-[2px] text-[10px] font-medium uppercase tracking-[0.08em] ${t} ${className}`}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ stats */

export function Stat({ label, value, hint, tone }) {
  const valueTone = tone === "warn" ? "text-warn" : "";
  return (
    <div className="card p-4">
      <div className={`text-[10px] font-medium uppercase tracking-[0.12em] text-faint`}>
        {label}
      </div>
      <div className={`mt-1.5 text-[26px] font-semibold leading-none tracking-[-0.02em] ${valueTone}`}>
        {value}
      </div>
      {hint && <div className="mt-1 text-[12px] text-dim">{hint}</div>}
    </div>
  );
}

export function EmptyState({ title, children, icon }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[12px] border border-dashed border-line-strong px-6 py-12 text-center">
      {icon && <div className="mb-2 text-faint">{icon}</div>}
      <p className="text-[14px] font-semibold">{title}</p>
      {children && <p className="mt-1 max-w-xs text-[13px] text-dim">{children}</p>}
    </div>
  );
}

/* ---------------------------------------------------------------- controls */

export function LinkButton({ href, children, variant = "primary", className = "" }) {
  const styles = {
    primary: "bg-action text-action-text hover:opacity-90",
    secondary: "border border-line-strong text-text hover:bg-surface-2",
    ghost: "text-dim hover:text-text hover:bg-surface-2",
  }[variant];
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 rounded-[10px] px-3 py-[7px] text-[13px] font-semibold transition-colors ${styles} ${className}`}
    >
      {children}
    </Link>
  );
}

export function Kbd({ children }) {
  return (
    <kbd className="rounded-[6px] border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-faint">
      {children}
    </kbd>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 block text-[12px] font-medium text-dim">{label}</span>
      )}
      {children}
      {hint && <span className="mt-1 block text-[11px] text-faint">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-[10px] border border-line-strong bg-surface px-3 py-2 text-[13px] text-text outline-none transition-colors placeholder:text-faint focus:border-[color-mix(in_srgb,var(--accent)_60%,var(--line-strong))]";

/* ---------------------------------------------------------------- avatars */

const AV_HUES = [
  "197 71% 52%", "265 60% 60%", "12 65% 58%", "150 45% 48%",
  "43 80% 55%", "330 55% 60%", "220 55% 58%", "95 40% 48%",
];
function hueFor(seed = "") {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AV_HUES[h % AV_HUES.length];
}
function initials(name = "", email = "") {
  const src = (name || email || "?").trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || src[0].toUpperCase();
}

export function Avatar({ name, email, src, size = 24, ring = false }) {
  const label = initials(name, email);
  const hsl = hueFor(name || email || label);
  const dim = { width: size, height: size, fontSize: Math.round(size * 0.4) };
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name || email || ""}
        style={dim}
        className={`shrink-0 rounded-full object-cover ${ring ? "ring-2 ring-surface" : ""}`}
      />
    );
  }
  return (
    <span
      style={{
        ...dim,
        background: `hsl(${hsl} / 0.22)`,
        color: `hsl(${hsl} / 1)`,
      }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${ring ? "ring-2 ring-surface" : ""}`}
      title={name || email}
    >
      {label}
    </span>
  );
}

export function AvatarStack({ people = [], size = 22, max = 4 }) {
  const seen = new Set();
  const unique = people.filter((p) => {
    const k = p?.id || p?.email;
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const shown = unique.slice(0, max);
  const extra = unique.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((p, i) => (
        <span
          key={p.id || p.email || i}
          style={{ marginLeft: i === 0 ? 0 : -size * 0.32 }}
        >
          <Avatar name={p.name} email={p.email} src={p.image} size={size} ring />
        </span>
      ))}
      {extra > 0 && (
        <span
          style={{ width: size, height: size, marginLeft: -size * 0.32, fontSize: size * 0.38 }}
          className="inline-flex items-center justify-center rounded-full bg-surface-3 font-semibold text-dim ring-2 ring-surface"
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- formatters */

export function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function fmtDateShort(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function fmtDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function relTime(iso) {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDateShort(iso);
}

/** "3 days overdue" / "due in 2 days" / "due today" */
export function duePhrase(iso) {
  if (!iso) return null;
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86400000);
  if (days < 0) return { text: `${Math.abs(days)} day${days === -1 ? "" : "s"} overdue`, overdue: true };
  if (days === 0) return { text: "due today", soon: true };
  if (days <= 3) return { text: `due in ${days} day${days === 1 ? "" : "s"}`, soon: true };
  return { text: `due ${fmtDateShort(iso)}`, overdue: false };
}
