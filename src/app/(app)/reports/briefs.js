"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { Avatar } from "@/components/ui";

function BriefCard({ item }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(item.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {}
  };

  return (
    <div className="overflow-hidden rounded-[12px] border border-line bg-surface-2/40">
      <div className="flex items-center gap-2.5 px-3.5 py-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          {item.avatar ? (
            <Avatar name={item.avatar.name} email={item.avatar.email} size={26} />
          ) : (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-faint" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold">{item.title}</span>
            {item.subtitle && (
              <span className="mono block truncate text-[9px] uppercase tracking-[0.12em] text-faint">
                {item.subtitle}
              </span>
            )}
          </span>
          <Icon
            name={open ? "chevronDown" : "chevron"}
            size={13}
            className="shrink-0 text-faint"
          />
        </button>
        <button
          type="button"
          onClick={copy}
          title="Copy to clipboard"
          className={`shrink-0 rounded-md p-1 transition-colors ${
            copied ? "text-ok" : "text-faint hover:text-text"
          }`}
        >
          <Icon name={copied ? "check" : "copy"} size={14} />
        </button>
      </div>
      {open && (
        <div className="whitespace-pre-wrap border-t border-line px-3.5 py-3.5 font-sans text-[12.5px] leading-relaxed text-dim">
          {item.body}
        </div>
      )}
    </div>
  );
}

export function BriefColumn({ title, eyebrow, items }) {
  return (
    <section className="card p-5">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em]">
          <Icon name="sparkle" size={15} className="text-faint" />
          {title}
        </h2>
        <span className="mono text-[9px] uppercase tracking-[0.14em] text-faint">{eyebrow}</span>
      </header>
      {items.length === 0 ? (
        <p className="text-[13px] text-dim">Nothing to report yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((it) => (
            <BriefCard key={it.id} item={it} />
          ))}
        </div>
      )}
    </section>
  );
}
