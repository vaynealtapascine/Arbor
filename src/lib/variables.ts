// Placeholders that templates fill in when they are used.
export const VARIABLES: [string, string][] = [
  ['{name}', 'what you type after the template name'],
  ['{date}', 'today, e.g. 2026-09-20'],
  ['{time}', 'the time, e.g. 14:05'],
  ['{weekday}', 'e.g. Monday'],
  ['{month}', 'e.g. September'],
  ['{year}', 'e.g. 2026'],
  ['{week}', 'ISO week number'],
];

function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - start.getTime()) / 86_400_000 + 1) / 7);
}

export function fillVariables(text: string, name: string, now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const values: Record<string, string> = {
    name,
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    today: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    weekday: now.toLocaleDateString('en-US', { weekday: 'long' }),
    month: now.toLocaleDateString('en-US', { month: 'long' }),
    year: String(now.getFullYear()),
    week: String(isoWeek(now)),
  };
  return text.replace(/\{(name|date|today|time|weekday|month|year|week)\}/gi, (_, k: string) => values[k.toLowerCase()]);
}
