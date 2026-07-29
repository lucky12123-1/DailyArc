export function formatDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function formatTime(date = new Date()) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function sleepHoursBetween(sleepTime: string, wakeTime: string) {
  const [sleepHour, sleepMinute] = sleepTime.split(":").map(Number);
  const [wakeHour, wakeMinute] = wakeTime.split(":").map(Number);
  if ([sleepHour, sleepMinute, wakeHour, wakeMinute].some(Number.isNaN)) return 0;
  const sleepMinutes = sleepHour * 60 + sleepMinute;
  let wakeMinutes = wakeHour * 60 + wakeMinute;
  if (wakeMinutes === sleepMinutes) return 0;
  if (wakeMinutes <= sleepMinutes) wakeMinutes += 24 * 60;
  return Math.round((wakeMinutes - sleepMinutes) / 15) / 4;
}

export function hoursBetween(timeA: string, timeB: string) {
  return sleepHoursBetween(timeA, timeB);
}

export function sleepStartPoints(sleep: number) {
  const hours = Math.max(0, Math.min(sleep, 12));
  if (hours >= 6 && hours <= 7) return 20;
  if (hours <= 0) return 0;
  if (hours < 6) return Math.round((hours / 6) * 20);
  return Math.max(0, Math.round(20 - (hours - 7) * 6));
}

export function minutesBetween(start: string, end: string, date: string): number {
  const startDate = new Date(`${date}T${start || "00:00"}:00`);
  let endDate = new Date(`${date}T${end || "00:00"}:00`);
  if (endDate < startDate) {
    endDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);
  }
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60_000));
}
export function wastedHours(screenTime: number) {
  return Math.round(Math.max(0, screenTime - 1) * 100) / 100;
}
