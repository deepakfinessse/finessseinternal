import Link from "next/link";

export function Card({ title, description, action, children, className = "" }) {
  return (
    <section
      className={`rounded-2xl border border-gray/20 bg-background p-5 shadow-sm ${className}`}
    >
      {(title || action) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-lg font-heading">{title}</h2>}
            {description && (
              <p className="mt-0.5 text-sm text-gray">{description}</p>
            )}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

const TONES = {
  active: "bg-primary/10 text-primary",
  invited: "bg-secondary/15 text-secondary",
  suspended: "bg-secondary/15 text-secondary",
  deactivated: "bg-gray/15 text-gray",
  pending: "bg-secondary/15 text-secondary",
  accepted: "bg-primary/10 text-primary",
  revoked: "bg-gray/15 text-gray",
  expired: "bg-gray/15 text-gray",
  neutral: "bg-gray/15 text-gray",
};

export function Badge({ children, tone = "neutral" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${TONES[tone] || TONES.neutral}`}
    >
      {children}
    </span>
  );
}

export function Stat({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-gray/20 bg-background p-4">
      <div className="text-2xl font-heading">{value}</div>
      <div className="text-sm text-gray">{label}</div>
      {hint && <div className="mt-1 text-xs text-gray">{hint}</div>}
    </div>
  );
}

export function EmptyState({ title, children }) {
  return (
    <div className="rounded-xl border border-dashed border-gray/30 p-8 text-center">
      <p className="font-semibold">{title}</p>
      {children && <p className="mt-1 text-sm text-gray">{children}</p>}
    </div>
  );
}

export function LinkButton({ href, children, variant = "primary" }) {
  const styles =
    variant === "primary"
      ? "bg-primary text-white hover:opacity-90"
      : "border border-gray/30 hover:border-primary hover:text-primary";
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold ${styles}`}
    >
      {children}
    </Link>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-gray/30 bg-background px-3 py-2 text-sm outline-none focus:border-primary";

export function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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
  return `${days}d ago`;
}
