import "server-only";
import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { calculateScore } from "@/lib/scoring";
import { evaluateGoals, getDefaultGoals, resetGoalsForNewDay } from "@/lib/day-utils";
import { sleepStartPoints, wastedHours } from "@/lib/time-utils";
import { type ActiveDay, type DayRecord } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { readSession } from "@/backend/security";

const challenges = [["What does O(1) space complexity mean?", "constant space"], ["What is the time complexity of binary search?", "O(log n)"], ["What does 'DRY' stand for in software engineering?", "don't repeat yourself"], ["What is a closure in JavaScript?", "a function with access to its outer scope"], ["What is the difference between == and === in JavaScript?", "=== checks type and value"], ["What does SQL stand for?", "structured query language"]] as const;
export type Workspace = { user: { id: string; name: string }; activeDay: ActiveDay | null; history: DayRecord[] };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, "");
function challengeFor(date: string) { const index = [...date].reduce((total, character) => total + character.charCodeAt(0), 0) % challenges.length; return { prompt: challenges[index][0], answer: challenges[index][1] }; }
function publicDay(day: any) { 
  if (!day) return null; 
  const { answer: _answer, ...dailyProgramming } = day.dailyProgramming || {}; 
  return { ...day, dailyProgramming } as ActiveDay; 
}

export function publicWorkspace(workspace: any): Workspace {
  if (!workspace || !workspace.user) return { user: { id: "", name: "" }, activeDay: null, history: [] };
  return { 
    user: { id: workspace.user.id, name: workspace.user.name }, 
    activeDay: publicDay(workspace.activeDay), 
    history: workspace.history || [] 
  }; 
}

export async function getUserWorkspace(userId: string): Promise<Workspace | null> {
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (!profile) return null;

  const { data: activeDay } = await supabase.from('active_days').select('*').eq('user_id', userId).maybeSingle();
  const { data: history } = await supabase.from('day_records').select('*').eq('user_id', userId).order('date', { ascending: false });

  return {
    user: { id: profile.id, name: profile.name },
    activeDay: activeDay ? publicDay(activeDay) : null,
    history: (history as DayRecord[]) || []
  };
}

export async function requireUser() { 
  const userId = readSession((await cookies()).get("dailyarc_session")?.value); 
  if (!userId) return null; 
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle(); 
  return data; 
}

export async function startDay(userId: string, input: { wakeTime: string; sleep: number; targetEnd: string }) {
  const date = today();
  const { data: existing } = await supabase.from('day_records').select('id').eq('user_id', userId).eq('date', date).maybeSingle();
  if (existing) throw new Error("A day for this date already exists.");

  const activeDay = { 
    user_id: userId, 
    date, 
    wakeTime: input.wakeTime, 
    sleep: input.sleep, 
    tasks: [], 
    screenTime: 0, 
    exercise: false, 
    reflection: "", 
    sleepTime: input.targetEnd, 
    startPoints: 0, 
    dailyProgramming: { ...challengeFor(date), result: "pending" }, 
    goals: resetGoalsForNewDay(getDefaultGoals()) 
  };

  const { error } = await supabase.from('active_days').upsert(activeDay);
  if (error) throw new Error(error.message);
  return getUserWorkspace(userId);
}

export async function saveActiveDay(userId: string, input: { activeDay: ActiveDay | null }) {
  if (!input.activeDay) return null;
  const { error } = await supabase.from('active_days').upsert({ ...input.activeDay, user_id: userId });
  if (error) throw new Error(error.message);
  return getUserWorkspace(userId);
}

export async function submitAnswer(userId: string, answer: string) {
  const { data: day } = await supabase.from('active_days').select('*').eq('user_id', userId).maybeSingle();
  if (!day || day.dailyProgramming?.result !== "pending") throw new Error("The daily question is no longer available.");
  
  const result = normalize(answer) === normalize(day.dailyProgramming.answer) ? "correct" : "incorrect";
  const { error } = await supabase.from('active_days').update({ 
    dailyProgramming: { ...day.dailyProgramming, submittedAnswer: answer, result } 
  }).eq('user_id', userId);
  if (error) throw new Error(error.message);
  return getUserWorkspace(userId);
}

export async function endDay(userId: string) {
  const { data: day } = await supabase.from('active_days').select('*').eq('user_id', userId).maybeSingle();
  if (!day) throw new Error("No active day found to save.");

  const goals = evaluateGoals(day.goals || [], day.wakeTime || "08:00");
  const record: DayRecord = { 
    id: randomUUID(), 
    date: day.date || today(), 
    wakeTime: day.wakeTime || "08:00", 
    sleepTime: new Date().toTimeString().slice(0, 5), 
    score: calculateScore({ tasks: day.tasks || [], goals: goals || [], schedule: day.schedule ?? [], sleep: day.sleep || 7 }).total, 
    sleep: day.sleep || 7, 
    wastedHours: wastedHours(day.screenTime || 0), 
    exercise: Boolean(day.exercise), 
    note: (day.reflection || "").trim(), 
    tasks: day.tasks || [], 
    screenTime: day.screenTime || 0, 
    goals: goals || [], 
    deepWork: 0, phone: 0, focus: 0, coding: 0 
  };

  const { error: insertErr } = await supabase.from('day_records').insert({ ...record, user_id: userId });
  if (insertErr) throw new Error(insertErr.message);
  await supabase.from('active_days').delete().eq('user_id', userId);
  
  return getUserWorkspace(userId);
}


export async function deleteRecord(userId: string, recordId: string) {
  const { error } = await supabase.from('day_records').delete().eq('id', recordId).eq('user_id', userId);
  if (error) throw new Error(error.message);
  return getUserWorkspace(userId);
}


  return {
    user: { id: profile.id, name: profile.name },
    activeDay: activeDay ? publicDay(activeDay) : null,
    history: (history as DayRecord[]) || []
  };
}

export async function requireUser() { 
  const userId = readSession((await cookies()).get("dailyarc_session")?.value); 
  if (!userId) return null; 
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle(); 
  return data; 
}

export async function startDay(userId: string, input: { wakeTime: string; sleep: number; targetEnd: string }) {
  const date = today();
  const { data: existing } = await supabase.from('day_records').select('id').eq('user_id', userId).eq('date', date).maybeSingle();
  if (existing) throw new Error("A day for this date already exists.");

  const activeDay = { 
    user_id: userId, 
    date, 
    wakeTime: input.wakeTime, 
    sleep: input.sleep, 
    tasks: [], 
    screenTime: 0, 
    exercise: false, 
    reflection: "", 
    sleepTime: input.targetEnd, 
    startPoints: 0, 
    dailyProgramming: { ...challengeFor(date), result: "pending" }, 
    goals: resetGoalsForNewDay(getDefaultGoals()) 
  };

  const { error } = await supabase.from('active_days').upsert(activeDay);
  if (error) throw new Error(error.message);
  return getUserWorkspace(userId);
}

export async function saveActiveDay(userId: string, input: { activeDay: ActiveDay | null }) {
  if (!input.activeDay) return null;
  const { dailyProgramming, ...safeDay } = input.activeDay;
  const { error } = await supabase.from('active_days').upsert({ ...safeDay, user_id: userId });
  if (error) throw new Error(error.message);
  return getUserWorkspace(userId);
}

export async function submitAnswer(userId: string, answer: string) {
  const { data: day } = await supabase.from('active_days').select('*').eq('user_id', userId).maybeSingle();
  if (!day || day.dailyProgramming?.result !== "pending") throw new Error("The daily question is no longer available.");
  
  const result = normalize(answer) === normalize(day.dailyProgramming.answer) ? "correct" : "incorrect";
  const { error } = await supabase.from('active_days').update({ 
    dailyProgramming: { ...day.dailyProgramming, submittedAnswer: answer, result } 
  }).eq('user_id', userId);
  if (error) throw new Error(error.message);
  return getUserWorkspace(userId);
}

export async function endDay(userId: string) {
  const { data: day } = await supabase.from('active_days').select('*').eq('user_id', userId).maybeSingle();
  if (!day || day.dailyProgramming?.result === "pending") throw new Error("Submit the daily programming question before saving.");

  const goals = evaluateGoals(day.goals, day.wakeTime);
  const record: DayRecord = { 
    id: randomUUID(), 
    date: day.date, 
    wakeTime: day.wakeTime, 
    sleepTime: new Date().toTimeString().slice(0, 5), 
    score: calculateScore({ tasks: day.tasks, goals, schedule: day.schedule ?? [], sleep: day.sleep }).total, 
    sleep: day.sleep, 
    wastedHours: wastedHours(day.screenTime), 
    exercise: day.exercise, 
    note: (day.reflection || "").trim(), 
    tasks: day.tasks || [], 
    screenTime: day.screenTime || 0, 
    goals: goals || [], 
    deepWork: 0, phone: 0, focus: 0, coding: 0 
  };

  const { error: insertErr } = await supabase.from('day_records').insert({ ...record, user_id: userId });
  if (insertErr) throw new Error(insertErr.message);
  await supabase.from('active_days').delete().eq('user_id', userId);
  
  return getUserWorkspace(userId);
}

export async function deleteRecord(userId: string, recordId: string) {
  const { error } = await supabase.from('day_records').delete().eq('id', recordId).eq('user_id', userId);
  if (error) throw new Error(error.message);
  return getUserWorkspace(userId);
}

