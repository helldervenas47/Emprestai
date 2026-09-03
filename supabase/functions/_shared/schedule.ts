export function timeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const [hour, minute] = String(value).split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

export function isTimeDueToday(value: string | null | undefined, nowMinutes: number): boolean {
  const target = timeToMinutes(value);
  return target !== null && nowMinutes >= target;
}

export function dueSlotKeys<T extends string>(
  slots: ReadonlyArray<{ key: T; time: string | null | undefined }>,
  nowMinutes: number,
  today: string,
  lastSent: Record<string, string>,
): T[] {
  return slots
    .filter((slot) => isTimeDueToday(slot.time, nowMinutes) && lastSent[slot.key] !== today)
    .map((slot) => slot.key);
}