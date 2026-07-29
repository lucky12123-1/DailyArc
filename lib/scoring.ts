import { type ScoreInput, type ScoreBreakdown, type Task, type TimeBlock, type Goal } from "./types";
import { sleepStartPoints, hoursBetween } from "./time-utils";

export function priorityPoints(tasks: Task[]): number {
  if (!tasks.length) return 0;
  const completed = tasks.filter((task) => task.complete).length;
  if (completed === tasks.length) return 20;
  return Math.round((completed / tasks.length) * 20);
}

export function blueprintPoints(schedule: TimeBlock[], sleep?: number, freeHours?: number): number {
  const sleepHours = sleep ?? 0;
  const allocated = schedule.reduce((sum, block) => sum + hoursBetween(block.start, block.end), 0);
  const hours = freeHours ?? Math.max(0, 24 - sleepHours - allocated - 2);
  const penalty = Math.round(hours * 6);
  return Math.max(0, 50 - penalty);
}

export function goalPoints(goals: Goal[]): number {
  const earned = goals.reduce((points, goal) => points + (goal.enabled && goal.completed ? 2 : 0), 0);
  return Math.min(10, earned);
}

export function calculateScore(input: ScoreInput & { exercise?: boolean; screenTime?: number }): ScoreBreakdown {
  const priorities = priorityPoints(input.tasks);
  const blueprint = blueprintPoints(input.schedule, input.sleep, input.freeHours);
  const goals = goalPoints(input.goals);
  const sleep = sleepStartPoints(input.sleep);
  const exerciseBonus = input.exercise ? 5 : 0;
  
  const wastedHours = Math.max(0, (input.screenTime ?? 0) - 1);
  const wastedPenalty = Math.round(wastedHours * 6);
  
  const total = Math.max(0, Math.min(100, Math.round(priorities + blueprint + goals + sleep + exerciseBonus - wastedPenalty)));
  return { total, priorities, blueprint, goals, sleep };
}

export function coachMessage(score: number, sleep: number, screenTime: number, goalPercent = 100) {
  let message = "";
  if (score >= 75) message = "Good work today — your evidence is strong. Sleep well and repeat the conditions tomorrow.";
  else if (sleep < 6) message = "Sleep is low. Protect your rest tonight; everything else gets harder without it.";
  else if (score < 70) message = "Today was not productive enough. Choose one priority before you end the day and make it count.";
  else if (screenTime > 3) message = "Screen time is leaking your focus. Put friction between you and the feed before the next task.";
  else message = "The day is still recoverable. Complete the highest-impact task before entertainment earns a vote.";
  if (goalPercent < 50 && goalPercent > 0) message += " Your commitments need attention — less than half were met.";
  else if (goalPercent >= 80) message += " Excellent commitment adherence.";
  return message;
}
