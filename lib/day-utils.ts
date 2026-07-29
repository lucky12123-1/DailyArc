import { type ActiveDay, type Goal } from "./types";

export function missingEveningEvidence(day: ActiveDay) {
  const missing: string[] = [];
  if (!day.tasks.length) missing.push("at least one priority");
  if (!day.reflection.trim()) missing.push("your end-day reflection");
  return missing;
}

export function evaluateGoals(goals: Goal[], wakeTime: string): Goal[] {
  const parseTimeToMinutes = (time: string): number => {
    if (!time || !time.includes(":")) return 9999;
    const [hour, minute] = time.split(":").map(Number);
    return Number.isNaN(hour) || Number.isNaN(minute) ? 9999 : hour * 60 + minute;
  };
  return goals.map((goal) => {
    if (!goal.enabled || goal.type !== "wake") return goal;
    return {
      ...goal,
      completed: parseTimeToMinutes(wakeTime) <= parseTimeToMinutes(goal.target || "06:00") && parseTimeToMinutes(wakeTime) > 0
    };
  });
}

export function getDefaultGoals(): Goal[] {
  return [{ id: crypto.randomUUID(), label: "Wake up by 6 AM", type: "wake", enabled: false, completed: false, target: "06:00" }];
}

export function resetGoalsForNewDay(goals: Goal[]) {
  return goals
    .filter((goal) => goal.type === "custom" || goal.type === "wake")
    .map((goal) => ({ ...goal, completed: false }));
}
