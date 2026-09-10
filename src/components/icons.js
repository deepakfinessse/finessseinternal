const P = {
  pulse: "M3 12h4l2-7 4 14 2-7h6",
  board: "M4 5h5v14H4zM10.5 5h9v9h-9z",
  timeline: "M4 7h16M4 12h10M4 17h6M7 7v10M14 12v5",
  heatmap: "M4 4h5v5H4zM10 4h5v5h-5zM16 4h4v5h-4zM4 10h5v5H4zM10 10h5v5h-5zM16 10h4v5h-4zM4 16h5v4H4zM10 16h5v4h-5z",
  people: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM3 20c0-3 2.7-5 6-5s6 2 6 5M17 11a3 3 0 1 0 0-6M21 20c0-2.4-1.6-4.3-4-4.8",
  campaigns: "M4 19V10M10 19V5M16 19v-6M22 19H2",
  reports: "M4 15l5-6 4 4 7-8M20 5h-4M20 5v4",
  intelligence: "M12 3l1.9 4.6L18.5 9l-3.5 3 1 5-4-2.6L8 17l1-5L5.5 9l4.6-1.4zM19 3v3M20.5 4.5h-3",
  projects: "M4 7a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z",
  tools: "M6 4v6M6 14v6M6 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM18 4v4M18 12v8M18 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM12 4v10M12 18v2M12 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-3.5-3.5",
  plus: "M12 5v14M5 12h14",
  filter: "M3 5h18l-7 8v6l-4-2v-4z",
  bell: "M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6ZM10 20a2 2 0 0 0 4 0",
  chevron: "M9 6l6 6-6 6",
  chevronDown: "M6 9l6 6 6-6",
  logout: "M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 17l5-5-5-5M21 12H9",
  check: "M5 13l4 4 10-11",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l3 2",
  link: "M10 14a4 4 0 0 0 6 .5l2-2a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6-.5l-2 2a4 4 0 0 0 6 6l1-1",
  comment: "M4 5h16v11H8l-4 4z",
  dot: "M12 12h.01",
};

export function Icon({ name, size = 18, className = "", strokeWidth = 1.6 }) {
  const d = P[name] || P.dot;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={d} />
    </svg>
  );
}
