const PATHS: Record<string, string> = {
  plus: 'M8 3v10M3 8h10',
  grid: 'M2.5 2.5h11v11h-11zM2.5 6.5h11M2.5 10h11M6.5 2.5v11',
  down: 'M8 2.5v9M4.5 8 8 11.5 11.5 8M3 13.5h10',
  eraser: 'M6 13.5h7.5M3.2 9.8l5.6-5.6a1.2 1.2 0 0 1 1.7 0l2.3 2.3a1.2 1.2 0 0 1 0 1.7L8.5 12.5H6l-2.8-2.7Z',
  range: 'M2.5 2.5h4v4h-4zM9.5 9.5h4v4h-4zM6.5 4.5h3a2 2 0 0 1 2 2v3',
  search: 'M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10ZM10.6 10.6 14 14',
  send: 'M2.5 8 13.5 2.5 10 13.5 7.5 8.5 2.5 8ZM7.5 8.5 13.5 2.5',
  lock: 'M4 7.5h8v6H4zM5.5 7.5V5.5a2.5 2.5 0 0 1 5 0v2',
  check: 'M3 8.5 6.5 12 13 4.5',
  x: 'M4 4l8 8M12 4l-8 8',
  undo: 'M5.5 3.5 2.5 6.5l3 3M2.5 6.5H10a3.5 3.5 0 0 1 0 7H7',
  inbox: 'M2.5 9.5 4 3.5h8l1.5 6v4h-11zM2.5 9.5h3.5l1 1.5h2l1-1.5h3.5',
  table: 'M2.5 3h11v10h-11zM2.5 6.5h11M6 6.5V13',
  sliders: 'M3 4.5h10M3 11.5h10M6 3v3M10 10v3',
  history: 'M3 8a5 5 0 1 0 1.5-3.6M3 2.5v2.5h2.5M8 5.5V8l2 1.5',
  pencil: 'M10.5 2.8l2.7 2.7-7.7 7.7H2.8v-2.7z',
  comment: 'M2.5 3.5h11v7.5H7L4 13.5V11H2.5z',
};

export function Icon({ name, label }: { name: keyof typeof PATHS | string; label?: string }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg className="icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
