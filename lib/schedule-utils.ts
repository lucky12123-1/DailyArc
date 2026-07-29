import { type Task, type TimeBlock } from "./types";

export function emptyTasks(): Task[] {
  return [];
}

export function emptySchedule(): TimeBlock[] {
  return [];
}

export function normalizeSchedule(blocks: TimeBlock[] | undefined | null): TimeBlock[] {
  const LEGACY_TYPE_MAP: Record<string, TimeBlock["type"]> = {
    flexible: "Free",
    Flexible: "Free",
    fixed: "Fixed",
    Fixed: "Fixed",
    committed: "Committed",
    Committed: "Committed",
    free: "Free",
    Free: "Free",
  };
  if (!Array.isArray(blocks)) return [];
  return blocks.map((block) => ({
    id: block.id,
    start: block.start,
    end: block.end,
    title: block.title,
    type: LEGACY_TYPE_MAP[block.type] ?? "Free",
    ...(block.category ? { category: block.category } : {}),
  }));
}

export function createWeeklySchedulePlan(): WeeklySchedulePlan {
  const today = new Intl.DateTimeFormat("en-CA").format(new Date());
  return { startsOn: today, endsOn: today, blocks: {} };
}

export function scheduleFromWeeklyPlan(plan: WeeklySchedulePlan | null, date: string): TimeBlock[] {
  if (!plan) return [];
  const day = new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
  return plan.blocks[day]?.map((block) => ({ ...block, id: crypto.randomUUID() })) ?? [];
}

export type WeeklySchedulePlan = {
  startsOn: string;
  endsOn: string;
  blocks: Record<string, TimeBlock[]>;
};
