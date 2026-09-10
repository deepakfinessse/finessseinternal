"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";

export function SidebarNav({ groups }) {
  const pathname = usePathname();

  const isActive = (href) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <nav className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 px-2.5 text-[10px] font-medium uppercase tracking-[0.13em] text-faint">
            {group.label}
          </p>
          <ul className="flex flex-col gap-[2px]">
            {group.items.map((item) => {
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`group flex items-center gap-2.5 rounded-[9px] px-2.5 py-[7px] text-[13px] transition-colors ${
                      active
                        ? "bg-surface-3 font-semibold text-text"
                        : "text-dim hover:bg-surface-2 hover:text-text"
                    }`}
                  >
                    <Icon
                      name={item.icon}
                      size={16}
                      className={active ? "text-text" : "text-faint group-hover:text-dim"}
                    />
                    <span className="truncate">{item.label}</span>
                    {item.badge ? (
                      <span className="ml-auto rounded-full bg-warn-bg px-1.5 text-[10px] font-semibold text-warn">
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
