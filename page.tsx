"use client";

import {
  Activity, Archive, ArrowRight, BarChart3, BookOpen, BrainCircuit, CalendarDays, Check,
  CheckCircle2, ChevronRight, CircleAlert, Clock3, Download, Edit2, Flame, Goal as GoalIcon, GraduationCap, History, LayoutDashboard,
  KeyRound, LockKeyhole, Maximize2, Menu, Moon, Plus, ShieldCheck, Sparkles, Target, TimerReset, Trash2, Upload, UserPlus, Users, X, Zap
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import {
  calculateScore, coachMessage
} from "@/lib/scoring";
import {
  formatDate, formatTime, sleepHoursBetween, sleepStartPoints, minutesBetween, hoursBetween
} from "@/lib/time-utils";
import {
  missingEveningEvidence, resetGoalsForNewDay
} from "@/lib/day-utils";
import {
  emptyPractice, practiceStateFromJSON
} from "@/lib/practice-utils";
import {
  emptyTasks, emptySchedule, normalizeSchedule, createWeeklySchedulePlan, scheduleFromWeeklyPlan
} from "@/lib/schedule-utils";
import {
  type ActiveDay, type DayRecord, type FreeCategory, type Goal, type PracticeSession, type PracticeState, type PracticeTopic, type Task, type TimeBlock, type WeeklySchedulePlan, type FreeCategory as FreeCategoryType, freeCategories, weekdays
} from "@/lib/types";

async function apiRequest(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error("Request failed");
  return response.json();
}


type View = "dashboard" | "history" | "deepPractice" | "settings";
type StartForm = { wakeTime: string; sleep: number };
type UserWorkspace = {
  id: string;
  name: string;
  openaiApiKey: string;
  activeDay: ActiveDay | null;
  history: DayRecord[];
  weeklyPlan: WeeklySchedulePlan | null;
  practice: PracticeState;
  permanentGoals: Goal[];
};

const storageKey = "dailyarc-real-data-v3";
const previousStorageKey = "dailyarc-real-data-v2";
const legacyStorageKey = "dailyarc-real-data-v1";
const uuid = () => crypto.randomUUID();
const prettyDate = (date: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${date}T12:00:00`));

export default function Home() {
  const now = useLiveClock();
  const [view, setView] = useState<View>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [users, setUsers] = useState<UserWorkspace[]>([]);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [activeDay, setActiveDay] = useState<ActiveDay | null>(null);
  const [history, setHistory] = useState<DayRecord[]>([]);
  const [startOpen, setStartOpen] = useState(false);
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklySchedulePlan | null>(null);
  const [practice, setPractice] = useState<PracticeState>(emptyPractice);
  const [permanentGoals, setPermanentGoals] = useState<Goal[]>([]);
  const [endDayError, setEndDayError] = useState("");
  const activeUser = users.find((user) => user.id === activeUserId) ?? null;

  useEffect(() => {
  async function loadFromServer() {
    try {
      const data = await apiRequest('/api/workspace');
      const userData = {
      id: data.user.id,
      name: data.user.name,
      openaiApiKey: "",
      activeDay: data.activeDay,
      history: data.history,
      weeklyPlan: null,
      practice: emptyPractice(),
      permanentGoals: []
};
      setUsers([userData]);
      setActiveUserId(data.user.id);
      if (data.activeDay) setActiveDay(data.activeDay);
      setHistory(data.history);
    } catch (error) {
      // No session or error
    } finally {
      setReady(true);
    }
  }
  loadFromServer();
}, []);

  useEffect(() => {
  if (!ready || !activeUserId || !activeDay) return;
  // Debounce or just send the update
  apiRequest('/api/workspace', 'PUT', { activeDay }).catch(console.error);
}, [activeDay, activeUserId, ready]);

  useEffect(() => {
  if (!ready) return;
  // We no longer save the users list to localStorage.
  // The server-side API tracks the authenticated user.
}, [activeUserId, ready, users]);

  function loadWorkspace(user: UserWorkspace) {
    const savedHistory = user.history ?? [];
    const savedDay = user.activeDay ? {
      ...user.activeDay,
      schedule: normalizeSchedule(user.activeDay.schedule),
      startPoints: typeof user.activeDay.startPoints === "number" ? user.activeDay.startPoints : (savedHistory.length ? sleepStartPoints(user.activeDay.sleep) : 0),
    } : null;
    setActiveDay(savedDay);
    setHistory(savedHistory);
    setWeeklyPlan(user.weeklyPlan ? { ...user.weeklyPlan, blocks: Object.fromEntries(Object.entries(user.weeklyPlan.blocks).map(([day, blocks]) => [day, normalizeSchedule(blocks)])) } : null);
    setPractice(practiceStateFromJSON((user as UserWorkspace & { practice?: unknown }).practice));
    setPermanentGoals(user.permanentGoals ?? []);
    setEndDayError("");
  }

  function createWorkspace(name: string, data: Partial<Omit<UserWorkspace, "id" | "name" | "openaiApiKey">> = {}, apiKey = "") {
    return { id: uuid(), name: name.trim() || "New user", openaiApiKey: apiKey, activeDay: data.activeDay ?? null, history: data.history ?? [], weeklyPlan: data.weeklyPlan ?? null, practice: practiceStateFromJSON(data.practice), permanentGoals: data.permanentGoals ?? [] };
  }

  function addUser(name: string, apiKey = "") {
    const user = createWorkspace(name, {}, apiKey.trim());
    setUsers((current) => [...current, user]);
    setActiveUserId(user.id);
    loadWorkspace(user);
    setView("dashboard");
  }

  function switchUser(id: string) {
    const user = users.find((item) => item.id === id);
    if (!user || user.id === activeUserId) return;
    setActiveUserId(user.id);
    loadWorkspace(user);
  }

  function saveUserAccess(name: string, apiKey: string) {
    if (!activeUserId) return;
    setUsers((current) => current.map((user) => user.id === activeUserId ? { ...user, name: name.trim() || user.name, openaiApiKey: apiKey.trim() } : user));
  }

  const currentScore = activeDay ? calculateScore({ tasks: activeDay.tasks, goals: activeDay.goals, schedule: activeDay.schedule ?? [], sleep: activeDay.sleep, exercise: activeDay.exercise, screenTime: activeDay.screenTime ?? 0 }).total : 0;
  const previousRecord = history.filter((day) => day.date < formatDate(now)).sort((a, b) => b.date.localeCompare(a.date))[0];
  useEffect(() => {
    function runNinePmChecks() {
      const checkTime = new Date();
      if (!ready || !activeDay || activeDay.date !== formatDate(checkTime) || checkTime.getHours() < 21) return;
      if (!activeDay.ninePmCheck) {
        const missing = missingEveningEvidence(activeDay);
        if (missing.length) setActiveDay((day) => !day || day.ninePmCheck ? day : { ...day, ninePmCheck: { checkedAt: checkTime.toISOString(), missing, dismissed: false } });
      }
      if (activeDay.recoveryMission) return;
      const liveScore = calculateScore({ tasks: activeDay.tasks, goals: activeDay.goals, schedule: activeDay.schedule ?? [], sleep: activeDay.sleep, exercise: activeDay.exercise, screenTime: activeDay.screenTime ?? 0 }).total;
      if (liveScore >= 60) return;
      const scheduledDeadline = new Date(checkTime);
      scheduledDeadline.setHours(22, 0, 0, 0);
      const deadline = scheduledDeadline > checkTime ? scheduledDeadline : new Date(checkTime.getTime() + 60 * 60 * 1000);
      const title = "Recovery mission: 45 minutes of distraction-free work";
      const mission = { id: uuid(), createdAt: checkTime.toISOString(), deadline: deadline.toISOString(), title };
      setActiveDay((day) => !day || day.recoveryMission ? day : { ...day, recoveryMission: mission, tasks: [...day.tasks, { id: mission.id, title, meta: `Assigned because your 9 PM score was ${liveScore}/100. Deadline: ${deadline.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`, complete: false, impact: "high", deadline: mission.deadline }] });
      if ("Notification" in window && Notification.permission === "granted") new Notification("DailyArc recovery mission", { body: `${title}. Deadline in one hour.` });
    }
    runNinePmChecks();
    const timer = window.setInterval(runNinePmChecks, 30_000);
    return () => window.clearInterval(timer);
  }, [activeDay, ready]);
  const nav = (id: View, label: string, Icon: typeof LayoutDashboard) => <button onClick={() => { setView(id); setMenuOpen(false); }} className={`nav-item ${view === id ? "active" : ""}`}><Icon size={18} /><span>{label}</span></button>;

function startDay(data: StartForm) {
    const date = formatDate();
    const isFirstDay = history.length === 0;
    setActiveDay({ id: uuid(), date, ...data, tasks: emptyTasks(), schedule: normalizeSchedule(scheduleFromWeeklyPlan(weeklyPlan, date)), deepWork: 0, phone: 0, screenTime: 0, exercise: false, reflection: "", sleepTime: "", startPoints: isFirstDay ? 0 : sleepStartPoints(data.sleep), dailyProgramming: { prompt: "", answer: "", result: "pending" }, goals: resetGoalsForNewDay(permanentGoals) });
    setEndDayError("");
    setStartOpen(false);
  }

  async function finishDay() {
  if (!activeDay) return;
  try {
    const data = await apiRequest('/api/workspace', 'POST', { action: "end" });
    setHistory(data.history);
    setActiveDay(null);
    setView("history");
  } catch (error) {
    alert("Failed to save day");
  }
}

  if (!ready) return <main className="loading-screen"><ShieldCheck size={24} /><span>Loading your private DailyArc data…</span></main>;
  if (!activeUser) return <FirstUserScreen createUser={addUser} />;
  return <main className="app-frame">
    <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
      <div className="brand"><span className="brand-mark"><ShieldCheck size={21} /></span><span>DailyArc</span></div><p className="brand-subtitle">DISCIPLINE, MADE VISIBLE.</p>
      <nav><p className="nav-label">COMMAND CENTER</p>{nav("dashboard", "Today", LayoutDashboard)}{nav("history", "History", History)}{nav("deepPractice", "Deep Practice", GraduationCap)}<p className="nav-label spaced">ACCOUNT</p>{nav("settings", "Users & OpenAI", Users)}<span className="storage-note"><Archive size={15} /> Saved on this device</span></nav>
      <div className="sidebar-footer"><div className="avatar">{initials(activeUser.name)}</div><div><b>{activeUser.name}</b><span>Evidence over intention</span></div></div>
    </aside>
    {menuOpen && <button className="backdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}
    <section className="main-area"><header className="topbar"><button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu size={21} /></button><div><p className="eyebrow">{new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(now)}</p><h1>{view === "dashboard" ? "Your day, measured honestly." : view === "history" ? "Your actual history." : view === "deepPractice" ? "Focused learning, made measurable." : "Your private workspace settings."}</h1></div><div className="top-actions"><div className="clock-display" aria-label="Current local time"><Clock3 size={15} /><span>{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span></div><span className="private-pill"><ShieldCheck size={14} /> Local-first</span><div className="avatar small">{initials(activeUser.name)}</div></div></header>
      {view === "dashboard" && <Dashboard activeDay={activeDay} score={currentScore} todayLocal={formatDate(now)} onOpenStart={() => setStartOpen(true)} setActiveDay={setActiveDay} onFinish={finishDay} endDayError={endDayError} weeklyPlan={weeklyPlan} setWeeklyPlan={setWeeklyPlan} permanentGoals={permanentGoals} setPermanentGoals={setPermanentGoals} />}
      {view === "history" && <HistoryView history={history} setHistory={setHistory} />}
      {view === "deepPractice" && <DeepPracticeView practice={practice} setPractice={setPractice} todayLocal={formatDate(now)} hasApiKey={Boolean(activeUser?.openaiApiKey)} />}
      {view === "settings" && <UserSettings activeUser={activeUser} users={users} switchUser={switchUser} createUser={addUser} saveAccess={saveUserAccess} />}
    </section>
    {startOpen && <StartDayModal now={now} previousRecord={previousRecord} close={() => setStartOpen(false)} start={startDay} />}
  </main>;
}

function FirstUserScreen({ createUser }: { createUser: (name: string, apiKey?: string) => void }) {
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  return <main className="workspace-setup"><section className="workspace-card animate-in"><span className="workspace-mark"><UserPlus size={24} /></span><p className="eyebrow mint-text">DAILYARC PERSONAL WORKSPACE</p><h1>Create your workspace</h1><p>Set up a separate place for your plans, history, and optional OpenAI API key. You can create more users later.</p><form onSubmit={async (event) => { 
  event.preventDefault(); 
  if (!name.trim()) return;
  try {
    // 1. Register the user in the database
    await apiRequest('/api/auth/register', 'POST', { name, password: "placeholder_password" });
    // 2. Log them in
    await apiRequest('/api/auth/login', 'POST', { name, password: "placeholder_password" });
    // 3. Reload the page so the dashboard fetches their new account data
  } catch (error) {
    alert(error instanceof Error ? error.message : "Failed to create account.");
  }

}} className="workspace-form"><label>Your name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" /></label><label>OpenAI API key <small>Optional</small><input type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-…" /></label><div className="truth-callout"><KeyRound size={17} /><span>The key is saved only in this browser for this prototype. You can add or change it in Users & OpenAI later.</span></div><button className="primary-button full" type="submit" disabled={!name.trim()}>Create workspace <ArrowRight size={17} /></button></form></section></main>;
}

function UserSettings({ activeUser, users, switchUser, createUser, saveAccess }: { activeUser: UserWorkspace; users: UserWorkspace[]; switchUser: (id: string) => void; createUser: (name: string, apiKey?: string) => void; saveAccess: (name: string, apiKey: string) => void }) {
  const [name, setName] = useState(activeUser.name);
  const [apiKey, setApiKey] = useState(activeUser.openaiApiKey);
  const [newUserName, setNewUserName] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => { setName(activeUser.name); setApiKey(activeUser.openaiApiKey); setSaved(false); }, [activeUser.id, activeUser.name, activeUser.openaiApiKey]);

  return <div className="content animate-in"><section className="page-intro"><div><p className="eyebrow">ACCOUNT & AI ACCESS</p><h2>Separate data for every user.</h2><p>Each user gets a separate daily tracker, history, weekly plan, and optional OpenAI API key on this device.</p></div></section><section className="settings-grid"><Panel title="Your OpenAI access" icon={<KeyRound size={19} />} action={<span className="ai-badge">Private to this user</span>}><div className="settings-form"><label>Active user<select value={activeUser.id} onChange={(event) => switchUser(event.target.value)}>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label><label>Display name<input value={name} onChange={(event) => { setName(event.target.value); setSaved(false); }} /></label><label>OpenAI API key<input type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={(event) => { setApiKey(event.target.value); setSaved(false); }} placeholder="sk-…" /></label><div className="truth-callout"><KeyRound size={17} /><span>This browser-only version saves API keys in local storage, separately for each user. Use a secure server-side secret store before deploying publicly.</span></div><button className="primary-button" type="button" onClick={() => { saveAccess(name, apiKey); setSaved(true); }}><KeyRound size={15} /> Save user access</button>{saved && <span className="saved-message">Saved for {name.trim() || activeUser.name}</span>}</div></Panel><Panel title="Create another user" icon={<UserPlus size={19} />} action={<span className="count-pill">{users.length} user{users.length === 1 ? "" : "s"}</span>}><form className="settings-form" onSubmit={(event) => { event.preventDefault(); if (newUserName.trim()) { createUser(newUserName); setNewUserName(""); } }}><label>New user name<input value={newUserName} onChange={(event) => setNewUserName(event.target.value)} placeholder="Name" /></label><p className="panel-intro">A new user begins with a clean tracker and can add their own OpenAI key after creation.</p><button className="secondary-button" type="submit"><UserPlus size={15} /> Create user</button></form></Panel></section></div>;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U";
}

function useLiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function Dashboard({ activeDay, score, todayLocal, onOpenStart, setActiveDay, onFinish, endDayError, weeklyPlan, setWeeklyPlan, permanentGoals, setPermanentGoals }: { activeDay: ActiveDay | null; score: number; todayLocal: string; onOpenStart: () => void; setActiveDay: React.Dispatch<React.SetStateAction<ActiveDay | null>>; onFinish: () => void; endDayError: string; weeklyPlan: WeeklySchedulePlan | null; setWeeklyPlan: (plan: WeeklySchedulePlan | null) => void; permanentGoals: Goal[]; setPermanentGoals: (goals: Goal[]) => void }) {
  if (!activeDay) return <div className="content animate-in"><section className="start-banner empty-state"><div className="banner-orb"><Sparkles size={22} /></div><div><p className="eyebrow amber">NO ACTIVE DAY</p><h2>Start with reality, not optimism.</h2><p>There is no pre-filled history and no fake score here. Record today&apos;s condition, then create priorities that you can honestly review tonight.</p></div><button className="primary-button" onClick={onOpenStart}>Start today <ArrowRight size={17} /></button></section><section className="empty-dashboard"><Target size={28} /><h2>Your tracker starts when you do.</h2><p>Start Day records your baseline. Then add your own priorities and flexible-time blocks. Nothing appears in History until you save an end-day review.</p></section></div>;
  
  const completed = activeDay.tasks.filter((task) => task.complete).length;
  const schedule = activeDay.schedule ?? [];
  
  // Calculate learning time (self-study/work from Free blocks)
  // Calculate learning time (self-study/work category from Free blocks)
  const learningHours = schedule
    .filter(b => b.type === "Free" && b.category === "self_study/work")
    .reduce((sum, b) => sum + hoursBetween(b.start, b.end), 0);
  
  // Calculate workout time (workout category from Free blocks)
  const workoutHours = schedule
    .filter(b => b.type === "Free" && b.category === "workout")
    .reduce((sum, b) => sum + hoursBetween(b.start, b.end), 0);
  
  // Calculate free hours (unscheduled time after sleep, all blocks, and 2hr buffer)
  const totalScheduledHours = schedule.reduce((sum, b) => sum + hoursBetween(b.start, b.end), 0);
  const freeHours = Math.max(0, 24 - activeDay.sleep - totalScheduledHours - 2);
  
  // Time wasted = screenTime - 1 (first hour forgiven for important phone use)
  const screenTime = activeDay.screenTime ?? 0;
  const timeWasted = Math.max(0, screenTime - 1);
  
  const update = (patch: Partial<ActiveDay>) => setActiveDay((day) => day ? { ...day, ...patch } : day);
  const saveWeeklyPlan = (plan: WeeklySchedulePlan | null) => {
    setWeeklyPlan(plan);
    // Apply the template to today's active day immediately, overwriting any manual edits.
    if (activeDay) {
      const seeded = normalizeSchedule(scheduleFromWeeklyPlan(plan, activeDay.date));
      update({ schedule: seeded });
    }
  };
return <div className="content animate-in">
    <section className="start-banner active-banner"><div className="banner-orb"><Check size={22} /></div><div><p className="eyebrow green">ACTIVE DAY · {prettyDate(activeDay.date)}</p><h2>Make the plan true.</h2><p>Only the work you record can be judged. Protect flexible time before entertainment earns a vote.</p></div>{activeDay.date !== todayLocal ? <button className="date-fix" onClick={() => update({ date: todayLocal })}>Correct date to today</button> : <span className="live-status"><span /> LIVE</span>}</section>
    <section className="metrics-grid">
      <Metric icon={<Target />} label="Daily Score" value={`${score}`} suffix="/100" detail={score >= 75 ? "Evidence is strong" : "Needs stronger execution"} tone={score >= 75 ? "mint" : "amber"} />
      <Metric icon={<BookOpen />} label="Learning Time" value={learningHours.toFixed(1)} suffix=" hrs" detail="Self-study + Work (Free)" tone="blue" />
      <Metric icon={<Flame />} label="Workout Time" value={workoutHours.toFixed(1)} suffix=" hrs" detail="Workout (Free)" tone="lavender" />
      <Metric icon={<Activity />} label="Time Wasted" value={timeWasted.toFixed(1)} suffix=" hrs" detail="Phone screen time beyond 1h allowance" tone="coral" />
    </section>
    <section className="dashboard-grid">
      <div className="left-column">
        <TaskPanel tasks={activeDay.tasks} setTasks={(tasks) => update({ tasks })} />
        <SchedulePanel schedule={activeDay.schedule ?? []} setSchedule={(schedule) => update({ schedule })} flexibleHours={freeHours} weeklyPlan={weeklyPlan} setWeeklyPlan={saveWeeklyPlan} />
        <GoalsPanel goals={activeDay.goals} setGoals={(goals) => update({ goals })} permanentGoals={permanentGoals} setPermanentGoals={setPermanentGoals} />
      </div>
      <div className="right-column">
        <Panel title="DailyArc assessment" icon={<BrainCircuit size={19} />} action={<span className="ai-badge"><Sparkles size={13} /> Rule-based coach</span>}>
          <div className="coach-card"><div className="coach-icon"><Zap size={19} /></div><div><p className="coach-title">Direct verdict</p><p>{coachMessage(score, activeDay.deepWork ?? 0, activeDay.phone ?? 0)}</p></div></div>
          {activeDay.recoveryMission && <div className="recovery"><b>Recovery mission active</b><span>{activeDay.recoveryMission.title}. Complete it by {new Date(activeDay.recoveryMission.deadline).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.</span></div>}
          <div className="signal-row"><div><span>Focus protection</span><b>{(activeDay.phone ?? 0) < 2 ? "Strong" : "Leaking"}</b></div><div className="signal-track"><i style={{ width: `${Math.max(8, 100 - (activeDay.phone ?? 0) * 22)}%` }} /></div></div>
          <div className="signal-row"><div><span>Promise integrity</span><b>{completed ? "Evidence exists" : "Not yet tested"}</b></div><div className="signal-track mint"><i style={{ width: `${activeDay.tasks.length ? completed / activeDay.tasks.length * 100 : 0}%` }} /></div></div>
        </Panel>
        <Panel title="Midday accountability" icon={<Activity size={19} />} action={<span className="time-label">Record reality</span>}>
          <p className="accountability-question">Are you actually blocked, or are you avoiding the uncomfortable first step?</p>
          <div className="quick-controls"><label>Screen time<input type="number" min="0" max="24" step="0.25" value={activeDay.screenTime ?? 0} onChange={(e) => update({ screenTime: Number(e.target.value) })} /><span>hrs</span></label></div>
        </Panel>
        <DailyProgrammingPanel />
        <Panel title="End-day review" icon={<CheckCircle2 size={19} />} action={<span className="time-label">Saves a real record</span>}>
          <label className="checkbox-row"><input type="checkbox" checked={activeDay.exercise} onChange={(e) => update({ exercise: e.target.checked })} /><span>Exercise or meaningful movement completed</span></label>
          <label className="bedtime-control">Bedtime <input type="time" value={activeDay.sleepTime} onChange={(e) => update({ sleepTime: e.target.value })} /><span>Used to calculate tomorrow&apos;s sleep.</span></label>
          <textarea value={activeDay.reflection} onChange={(e) => update({ reflection: e.target.value })} placeholder="What did you accomplish? What distracted you? What will change tomorrow?" />
          <button className="secondary-button finish-button" onClick={onFinish}>Save end-day review <ArrowRight size={16} /></button>
        </Panel>
      </div>
    </section>
    {activeDay.ninePmCheck && !activeDay.ninePmCheck.dismissed && <NinePmCheckModal missing={activeDay.ninePmCheck.missing} dismiss={() => update({ ninePmCheck: { ...activeDay.ninePmCheck!, dismissed: true } })} />}
  </div>;
}

function GoalsPanel({ goals, setGoals, permanentGoals, setPermanentGoals }: { goals: Goal[]; setGoals: (goals: Goal[]) => void; permanentGoals: Goal[]; setPermanentGoals: (goals: Goal[]) => void }) {
  const enabledGoals = goals.filter(g => g.enabled);
  const completedGoals = enabledGoals.filter(g => g.completed).length;
  const percent = enabledGoals.length ? Math.round(completedGoals / enabledGoals.length * 100) : 0;

  function addGoal(label: string) {
    const trimmed = label.trim();
    if (!trimmed) return;
    const goal: Goal = { id: uuid(), label: trimmed, type: 'custom', enabled: true, completed: false };
    setPermanentGoals([...permanentGoals, goal]);
    setGoals([...goals, { ...goal }]);
  }

  function toggleGoal(id: string) {
    setGoals(goals.map(g => g.id === id ? { ...g, completed: !g.completed } : g));
  }

  function toggleEnabled(id: string) {
    const target = goals.find(g => g.id === id);
    if (!target) return;
    const nextEnabled = !target.enabled;
    setPermanentGoals(permanentGoals.map(g => g.id === id ? { ...g, enabled: nextEnabled } : g));
    setGoals(goals.map(g => g.id === id ? { ...g, enabled: nextEnabled } : g));
  }

  function removeGoal(id: string) {
    setPermanentGoals(permanentGoals.filter(g => g.id !== id));
    setGoals(goals.filter(g => g.id !== id));
  }

  return <Panel title="Personal Goals" icon={<Target size={19} />} action={<span className="count-pill">{enabledGoals.length ? `${percent}% met` : 'Add goals'}</span>}>
    <p className="panel-intro">Permanent commitments that follow you every day. Tick when achieved — DailyArc rewards +2 per goal (max 10). Goals reset to unticked each new day; your list persists until you delete a goal.</p>
    <div className="goals-list">
      {goals.length ? goals.map((goal) => (
        <div key={goal.id} className={`goal-row ${goal.enabled ? 'enabled' : ''} ${goal.completed ? 'completed' : ''}`}>
          <label className="goal-toggle">
            <input type="checkbox" checked={goal.completed} onChange={() => toggleGoal(goal.id)} />
            <span><b>{goal.label}</b></span>
          </label>
          <button type="button" onClick={() => toggleEnabled(goal.id)} aria-label={goal.enabled ? `Disable ${goal.label}` : `Enable ${goal.label}`} style={{ background: 'transparent', border: '1px solid ' + (goal.enabled ? '#daf5ea' : '#eceef3'), color: goal.enabled ? '#2d9f7d' : '#8a8e9c', padding: '4px 8px', borderRadius: '6px', fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {goal.enabled ? 'On' : 'Off'}
          </button>
          {goal.completed ? <span className="goal-status goal-met">Achieved +2</span> : <span className="goal-status goal-unmet">Pending 0</span>}
          <button className="inline-delete" aria-label={`Remove ${goal.label}`} onClick={() => removeGoal(goal.id)}><Trash2 size={15} /></button>
        </div>
      )) : <p className="blank-line">No commitments yet. Add one below &mdash; e.g. &ldquo;Wake up at 6 AM&rdquo;, &ldquo;Workout 30 min&rdquo;, &ldquo;Study 2 hrs&rdquo;. Your list will persist across days.</p>}
    </div>
    <form className="goal-add-form" onSubmit={(e) => { e.preventDefault(); const input = e.currentTarget.elements.namedItem('goal') as HTMLInputElement; addGoal(input.value); input.value = ''; }}><input name="goal" placeholder="Add a permanent commitment (e.g. Wake by 6 AM)" /><button type="submit" className="text-button"><Plus size={16} /> Add</button></form>
    {enabledGoals.length > 0 && <div className="goal-progress"><div className="goal-progress-bar"><i style={{ width: `${percent}%` }} /></div><span>${completedGoals} of ${enabledGoals.length} commitments met (${percent}%)</span></div>}
    <p className="schedule-help">Each commitment is worth +2 points when ticked (max 10 points from goals). Goals persist across days; tick boxes reset every new day. Use On/Off to temporarily skip a goal without deleting it.</p>
  </Panel>;
}

function DailyProgrammingPanel() {
  return <Panel title="Daily Programming" icon={<BrainCircuit size={19} />} action={<span className="challenge-status pending">Under development</span>}>
    <p className="panel-intro">Daily programming challenge is under development. It will appear here once ready.</p>
    <div className="dev-placeholder"><Zap size={24} /><span>Coming soon — algorithmic thinking challenge to sharpen your mind before end-of-day review.</span></div>
  </Panel>;
}

function TaskPanel({ tasks, setTasks }: { tasks: Task[]; setTasks: (tasks: Task[]) => void }) {
  const [title, setTitle] = useState(""); const [meta, setMeta] = useState(""); const [impact, setImpact] = useState<Task["impact"]>("high");
  function addTask(e: React.FormEvent) { e.preventDefault(); if (!title.trim()) return; setTasks([...tasks, { id: uuid(), title: title.trim(), meta: meta.trim() || "No time estimate recorded", complete: false, impact }]); setTitle(""); setMeta(""); }
  return <Panel title="Today’s priorities" icon={<GoalIcon size={19} />} action={<span className="count-pill">{tasks.filter((task) => task.complete).length}/{tasks.length} complete</span>}><p className="panel-intro">Add only work you are willing to review honestly tonight. Empty is better than performative.</p><div className="task-list">{tasks.length ? tasks.map((task, index) => <div key={task.id} className={`task ${task.complete ? "done" : ""}`}><button className="task-check" aria-label={`Mark ${task.title} complete`} onClick={() => setTasks(tasks.map((item) => item.id === task.id ? { ...item, complete: !item.complete } : item))}>{task.complete && <Check size={14} />}</button><span className="task-number">{String(index + 1).padStart(2, "0")}</span><span className="task-copy"><b>{task.title}</b><small>{task.meta}</small></span><span className={`impact ${task.impact}`}>{task.impact}</span><button className="inline-delete" aria-label={`Delete ${task.title}`} onClick={() => setTasks(tasks.filter((item) => item.id !== task.id))}><Trash2 size={15} /></button></div>) : <p className="blank-line">No priorities yet. Add the one task that most helps your future self.</p>}</div><form className="add-form" onSubmit={addTask}><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a specific priority" /><input value={meta} onChange={(e) => setMeta(e.target.value)} placeholder="Time / area (optional)" /><select value={impact} onChange={(e) => setImpact(e.target.value as Task["impact"])}><option value="high">High impact</option><option value="medium">Medium</option><option value="low">Low</option></select><button className="text-button" type="submit"><Plus size={16} /> Add priority</button></form></Panel>;
}

function SchedulePanel({ schedule, setSchedule, flexibleHours, weeklyPlan, setWeeklyPlan }: { schedule: TimeBlock[]; setSchedule: (blocks: TimeBlock[]) => void; flexibleHours: number; weeklyPlan: WeeklySchedulePlan | null; setWeeklyPlan: (plan: WeeklySchedulePlan | null) => void }) {
  const [start, setStart] = useState('07:00');
  const [end, setEnd] = useState('08:00');
  const [title, setTitle] = useState('');
  const [type, setType] = useState<TimeBlock['type']>('Free');
  const [category, setCategory] = useState<FreeCategory>('self_study/work');
  const [formError, setFormError] = useState('');
  const [weeklyEditorOpen, setWeeklyEditorOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<TimeBlock | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [detailBlock, setDetailBlock] = useState<TimeBlock | null>(null);
  const [expanded, setExpanded] = useState(true);

  const typeColors = {
    Fixed: { bg: '#fef2f2', border: '#ef4444', text: '#b91c1c', dot: '#ef4444', icon: <LockKeyhole size={14} /> },
    Committed: { bg: '#fefce8', border: '#eab308', text: '#a16207', dot: '#eab308', icon: <BookOpen size={14} /> },
    Free: { bg: '#ecfdf5', border: '#10b981', text: '#047857', dot: '#10b981', icon: <Zap size={14} /> }
  };

  const typeLabels = { Fixed: 'Fixed', Committed: 'Committed', Free: 'Free' };

  const categoryLabels: Record<FreeCategory, string> = {
    'self_study/work': 'Self-study / Work',
    'workout': 'Workout',
    'sleep': 'Sleep',
    'other': 'Other'
  };

  function categoryOf(block: TimeBlock): FreeCategory | null {
    if (block.type !== 'Free') return null;
    if (block.category && (freeCategories as readonly string[]).includes(block.category)) return block.category as FreeCategory;
    return 'other';
  }

  function timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  function minutesToTime(mins: number): string {
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function formatTimeRange(start: string, end: string): string {
    const s = timeToMinutes(start);
    const e = timeToMinutes(end);
    const h = Math.floor((e - s) / 60);
    const m = (e - s) % 60;
    return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
  }

  function getBlockPosition(block: TimeBlock) {
    const startMins = timeToMinutes(block.start);
    const endMins = timeToMinutes(block.end);
    const top = (startMins / (24 * 60)) * 100;
    const height = Math.max(3, ((endMins - startMins) / (24 * 60)) * 100);
    return { top: top + '%', height: height + '%' };
  }

  function overlapsExisting(start: string, end: string, ignoreId?: string): TimeBlock | null {
    const s = timeToMinutes(start);
    let e = timeToMinutes(end);
    if (e <= s) e = s + 1; // guard against zero-length
    for (const b of schedule) {
      if (ignoreId && b.id === ignoreId) continue;
      const bs = timeToMinutes(b.start);
      const be = timeToMinutes(b.end);
      // Two ranges [s,e) and [bs,be) overlap iff s < be AND bs < e
      if (s < be && bs < e) return b;
    }
    return null;
  }

  function addBlock(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!title.trim()) { setFormError('Name the block before adding it.'); return; }
    if (!start || !end || start === end || timeToMinutes(end) <= timeToMinutes(start)) { setFormError('End time must be after start time.'); return; }
    
    const clash = overlapsExisting(start, end, editingBlock?.id);
    if (clash) {
      setFormError(`Time overlaps with "${clash.title || 'Untitled'}" (${clash.start}–${clash.end}). Adjust the time or delete that block first.`);
      return;
    }

    const blockData = { start, end, title: title.trim(), type, ...(type === 'Free' ? { category } : {}) };
    if (editingBlock) {
      setSchedule(schedule.map(b => b.id === editingBlock.id ? { ...b, ...blockData } : b).sort((a, b) => a.start.localeCompare(b.start)));
      setEditingBlock(null);
    } else {
      setSchedule([...schedule, { id: uuid(), ...blockData }].sort((a, b) => a.start.localeCompare(b.start)));
    }
    setTitle(''); setStart('07:00'); setEnd('08:00'); setType('Free'); setCategory('self_study/work'); setShowAddModal(false);
  }

  function removeBlock(id: string) {
    setSchedule(schedule.filter((item) => item.id !== id));
  }

  function startEditBlock(block: TimeBlock) {
    setEditingBlock(block);
    setStart(block.start);
    setEnd(block.end);
    setTitle(block.title);
    setType(block.type);
    setCategory((block.category as FreeCategory) ?? 'self_study/work');
    setDetailBlock(null);
    setFormError('');
    setShowAddModal(true);
  }

  function cancelEdit() {
    setEditingBlock(null);
    setTitle(''); setStart('07:00'); setEnd('08:00'); setType('Free'); setCategory('self_study/work');
    setShowAddModal(false);
  }

  function openBlockDetail(block: TimeBlock) {
    setDetailBlock(detailBlock?.id === block.id ? null : block);
  }

  function handleTimelineClick(e: React.MouseEvent<HTMLDivElement>) {
    if (editingBlock) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const percent = Math.max(0, Math.min(1, y / rect.height));
    const mins = Math.round(percent * 24 * 60);
    const snappedMins = Math.round(mins / 15) * 15;
    const clickedTime = minutesToTime(snappedMins);
    const endMins = snappedMins + 60;
    if (endMins > 24 * 60) return;
    const clickedEnd = minutesToTime(endMins);
    setStart(clickedTime);
    setEnd(clickedEnd);
    setTitle('');
    setType('Free');
    setCategory('self_study/work');
    setDetailBlock(null);
    setShowAddModal(true);
  }

  function openAddModal() {
    setEditingBlock(null);
    setTitle('');
    setStart('07:00');
    setEnd('08:00');
    setType('Free');
    setCategory('self_study/work');
    setFormError('');
    setDetailBlock(null);
    setShowAddModal(true);
  }

  const sortedSchedule = [...schedule].sort((a, b) => a.start.localeCompare(b.start));

  return (
    <>
      <Panel title="Day Blueprint" icon={<CalendarDays size={19} />} action={
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="weekly-template-button" onClick={() => setWeeklyEditorOpen(true)}>
            <CalendarDays size={15} /> {weeklyPlan ? "Edit weekly template" : "Set weekly template"}
          </button>
          <button
            className="weekly-template-button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Collapse blueprint" : "Expand blueprint"}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            {expanded ? 'Collapse' : 'Expand'} <ChevronRight size={14} style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>
        </div>
      }>
        {expanded && (
        <>
        {/* Header Stats */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <div style={{ background: '#f8fafc', border: '1px solid #e9ebf0', borderRadius: '10px', padding: '12px 16px', minWidth: '140px' }}>
            <div style={{ fontSize: '11px', color: '#8a90a0', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Scheduled</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#1a1d29', fontFamily: '"DM Mono", monospace' }}>
              {sortedSchedule.reduce((sum, b) => sum + timeToMinutes(b.end) - timeToMinutes(b.start), 0) > 0 
                ? Math.floor(sortedSchedule.reduce((sum, b) => sum + timeToMinutes(b.end) - timeToMinutes(b.start), 0) / 60) + "h " + (sortedSchedule.reduce((sum, b) => sum + timeToMinutes(b.end) - timeToMinutes(b.start), 0) % 60) + "m"
                : '0h'}
            </div>
          </div>
          <div style={{ background: '#f8fafc', border: '1px solid #e9ebf0', borderRadius: '10px', padding: '12px 16px', minWidth: '140px' }}>
            <div style={{ fontSize: '11px', color: '#8a90a0', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Unallocated Free Time</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#047857', fontFamily: '"DM Mono", monospace' }}>
              {flexibleHours.toFixed(1)}h
            </div>
          </div>
          <div style={{ background: '#f8fafc', border: '1px solid #e9ebf0', borderRadius: '10px', padding: '12px 16px', minWidth: '140px' }}>
            <div style={{ fontSize: '11px', color: '#8a90a0', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Blocks</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#1a1d29', fontFamily: '"DM Mono", monospace' }}>
              {sortedSchedule.length}
            </div>
          </div>
        </div>

        {/* Type Legend */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {(['Fixed', 'Committed', 'Free'] as TimeBlock['type'][]).map((t) => {
            const c = typeColors[t];
            return (
              <button
                key={t}
                type="button"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '20px',
                  background: c.bg,
                  border: '1px solid ' + c.border,
                  cursor: 'default'
                }}
              >
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: c.dot }} />
                <span style={{ color: c.text, fontWeight: 600, fontSize: '12px' }}>{typeLabels[t]}</span>
              </button>
            );
          })}
        </div>

        {/* Visual Timeline */}
        <div className="timeline-visual" style={{ position: 'relative', minHeight: '600px', background: '#fafbfd', borderRadius: '12px', border: '1px solid #e9ebf0', overflow: 'visible' }}>
          {/* Hour markers with grid lines */}
          <div style={{ position: 'absolute', left: '0', top: '0', bottom: '0', width: '60px', background: '#f8fafc', borderRight: '1px solid #e9ebf0' }}>
            <div style={{ position: 'absolute', left: '0', right: '0', top: '0', bottom: '0', background: 'repeating-linear-gradient(to bottom, transparent, transparent 4.166%, #f0f2f5 4.166%, #f0f2f5 4.167%)' }} />
            {Array.from({ length: 24 }).map((_, h) => (
              <div key={h} style={{ position: 'absolute', top: (h / 24) * 100 + '%', left: '0', width: '60px', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', paddingTop: '1px', paddingRight: '12px' }}>
                <span style={{ fontSize: '10px', color: '#9aa0ac', fontFamily: '"DM Mono", monospace', fontWeight: 600, background: '#f8fafc', padding: '1px 4px', borderRadius: '3px', border: '1px solid #e9ebf0' }}>
                  {String(h).padStart(2, '0')}:00
                </span>
              </div>
            ))}
          </div>

          {/* Grid lines in main area */}
          <div style={{ position: 'absolute', left: '60px', right: '0', top: '0', bottom: '0', pointerEvents: 'none' }}>
            {Array.from({ length: 24 }).map((_, h) => (
              <div key={h} style={{ position: 'absolute', top: (h / 24) * 100 + '%', left: '0', right: '0', height: '1px', background: h % 2 === 0 ? '#e9ebf0' : '#f0f2f5' }} />
            ))}
          </div>

          {/* Blocks Container */}
          <div 
            style={{ position: 'absolute', left: '60px', right: '16px', top: '0', bottom: '0' }}
            onClick={handleTimelineClick}
            onDoubleClick={handleTimelineClick}
          >
            {sortedSchedule.length > 0 ? (
              sortedSchedule.map((block) => {
                const pos = getBlockPosition(block);
                const colors = typeColors[block.type];
                const isEditing = editingBlock?.id === block.id;
                const isDetail = detailBlock?.id === block.id;
                const isActive = isEditing || isDetail;
                const duration = formatTimeRange(block.start, block.end);
                const cat = categoryOf(block);
                const durationMins = timeToMinutes(block.end) - timeToMinutes(block.start);
                const isShort = durationMins < 30;
                const isMedium = durationMins >= 30 && durationMins < 60;
                const isTall = durationMins >= 60;

                return (
                  <div
                    key={block.id}
                    className={'timeline-block ' + block.type.toLowerCase()}
                    style={{
                      position: 'absolute',
                      left: '0',
                      right: '0',
                      top: pos.top,
                      height: pos.height,
                      minHeight: '14px',
                      background: colors.bg,
                      border: isActive ? '2px solid ' + colors.dot : '1px solid ' + colors.border,
                      borderRadius: '8px',
                      padding: isShort ? '2px 8px' : '6px 10px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'flex-start',
                      alignItems: 'stretch',
                      gap: isShort ? '1px' : '3px',
                      overflow: 'hidden',
                      boxShadow: isActive ? '0 0 0 2px ' + colors.dot + ', 0 4px 12px rgba(0,0,0,0.08)' : '0 2px 8px rgba(0,0,0,0.05)',
                      zIndex: isActive ? 10 : 1,
                      cursor: isEditing ? 'default' : 'pointer',
                      transition: 'box-shadow 0.2s, border-color 0.2s, transform 0.15s',
                      transform: isEditing ? 'scale(1.01)' : 'none'
                    }}
                    onClick={(e) => { e.stopPropagation(); openBlockDetail(block); }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.transform = 'translateX(4px)'; }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.transform = 'none'; }}
                  >
                    {/* Title row: title (always) + time (compact for short blocks) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: isShort ? '4px' : '8px', minWidth: 0 }}>
                      <b style={{
                        fontSize: isShort ? '10px' : '13px',
                        color: '#1a1d29',
                        maxWidth: isShort ? '60%' : '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        lineHeight: 1.2,
                        flex: '0 1 auto'
                      }}>
                        {block.title || <span style={{ color: '#9aa0ac', fontWeight: 400 }}>Untitled</span>}
                      </b>
                      {isShort ? (
                        <span style={{
                          fontSize: '9px',
                          fontFamily: '"DM Mono", monospace',
                          color: colors.text,
                          fontWeight: 600,
                          marginLeft: 'auto',
                          whiteSpace: 'nowrap',
                          flex: '0 0 auto'
                        }}>
                          {block.start}
                        </span>
                      ) : (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '10px',
                          fontFamily: '"DM Mono", monospace',
                          color: colors.text,
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          flex: '0 0 auto'
                        }}>
                          {block.start}–{block.end}
                          <span style={{ fontSize: '9px', opacity: 0.7 }}>({duration})</span>
                        </span>
                      )}
                    </div>

                    {/* Type + category badges (only for medium/tall blocks) */}
                    {!isShort && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '1px 7px',
                          borderRadius: '10px',
                          fontSize: '9px',
                          fontWeight: 700,
                          background: colors.border,
                          color: '#fff'
                        }}>
                          {colors.icon}
                          {typeLabels[block.type]}
                        </span>
                        {block.type === 'Free' && cat && (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '1px 7px',
                            borderRadius: '10px',
                            fontSize: '9px',
                            fontWeight: 700,
                            background: 'rgba(16,185,129,0.12)',
                            color: colors.text,
                            border: '1px solid ' + colors.border
                          }}>
                            {categoryLabels[cat]}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Bottom hint (only for tall blocks) */}
                    {isTall && !isActive && (
                      <div style={{ fontSize: '9px', color: '#9aa0ac', fontStyle: 'italic', marginTop: 'auto' }}>
                        Click to view details
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div style={{ 
                position: 'absolute', 
                top: '50%', 
                left: '0', 
                right: '0', 
                transform: 'translateY(-50%)', 
                textAlign: 'center', 
                padding: '40px 20px', 
                color: '#9aa0ac'
              }}>
                <div style={{ 
                  width: '80px', 
                  height: '80px', 
                  margin: '0 auto 20px', 
                  borderRadius: '50%', 
                  background: '#f0f2f5', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  border: '2px dashed #e0e4eb'
                }}>
                  <CalendarDays size={36} style={{ color: '#c0c6d0' }} />
                </div>
                <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 600, color: '#6b7280' }}>No blocks yet</h3>
                <p style={{ margin: '0 auto 20px', fontSize: '13px', maxWidth: '300px' }}>
                  Click anywhere on the timeline to add a block, or use the button below.
                </p>
                <button 
                  onClick={openAddModal}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 20px',
                    background: '#10b981',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'background 0.15s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#0ea372'}
                >
                  <Plus size={16} /> Add First Block
                </button>
              </div>
            )}
          </div>
          {/* Block Detail Popover (inside timeline-visual, positioned below block) */}
          {detailBlock && !showAddModal && !editingBlock && (() => {
            const block = detailBlock;
            const colors = typeColors[block.type];
            const cat = categoryOf(block);
            const duration = formatTimeRange(block.start, block.end);
            const startMins = timeToMinutes(block.start);
            const blockTopPct = (startMins / (24 * 60)) * 100;
            const blockH = Math.max(3, ((timeToMinutes(block.end) - startMins) / (24 * 60)) * 100);
            const topPct = Math.min(82, blockTopPct + blockH + 0.7);
            return (
              <div
                style={{
                  position: 'absolute',
                  left: '76px',
                  right: '8px',
                  top: topPct + '%',
                  zIndex: 30,
                  background: '#fff',
                  border: '2px solid ' + colors.border,
                  borderRadius: '12px',
                  boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
                  padding: '14px 16px',
                  maxWidth: '420px',
                  pointerEvents: 'auto'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      padding: '3px 10px', borderRadius: '12px', fontSize: '11px',
                      fontWeight: 700, background: colors.border, color: '#fff'
                    }}>
                      {colors.icon} {typeLabels[block.type]}
                    </span>
                    {block.type === 'Free' && cat && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', padding: '3px 10px',
                        borderRadius: '12px', fontSize: '11px', fontWeight: 700,
                        background: 'rgba(16,185,129,0.12)', color: colors.text, border: '1px solid ' + colors.border
                      }}>
                        {categoryLabels[cat]}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDetailBlock(null); }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: '24px', height: '24px', borderRadius: '6px',
                      background: 'transparent', border: 'none', color: '#9aa0ac', cursor: 'pointer'
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#1a1d29', marginBottom: '4px' }}>
                  {block.title || <span style={{ color: '#9aa0ac', fontWeight: 400 }}>Untitled</span>}
                </div>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  fontFamily: '"DM Mono", monospace', fontSize: '12px', fontWeight: 600, color: colors.text,
                  background: 'rgba(255,255,255,0.7)', padding: '3px 10px', borderRadius: '6px',
                  border: '1px solid ' + colors.border, marginBottom: '12px'
                }}>
                  {block.start} – {block.end} <span style={{ fontSize: '10px', opacity: 0.7 }}>({duration})</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); startEditBlock(block); }}
                    style={{
                      flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                      padding: '9px 12px', borderRadius: '8px', background: colors.border, color: '#fff',
                      border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', transition: 'opacity 0.15s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '0.88'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                  >
                    <Edit2 size={14} /> Edit block
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeBlock(block.id); setDetailBlock(null); }}
                    style={{
                      flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                      padding: '9px 12px', borderRadius: '8px', background: '#fff', color: '#c00',
                      border: '1px solid #fee', fontSize: '12px', fontWeight: 600, cursor: 'pointer', transition: 'background 0.15s'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#fee'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; }}
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Add/Edit Modal */}
        {(showAddModal || editingBlock) && (
          <div className="modal-backdrop" onClick={cancelEdit} style={{ 
            position: 'fixed', 
            inset: 0, 
            background: 'rgba(15, 23, 42, 0.5)', 
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}>
            <div className="modal" style={{ 
              width: '100%', 
              maxWidth: '480px', 
              background: '#fff', 
              borderRadius: '16px', 
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              animation: 'modalIn 0.2s ease-out'
            }} onClick={(e) => e.stopPropagation()}>
              <style jsx>{`
                @keyframes modalIn {
                  from { opacity: 0; transform: translateY(10px) scale(0.98); }
                  to { opacity: 1; transform: translateY(0) scale(1); }
                }
              `}</style>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e9ebf0' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#1a1d29' }}>
                  {editingBlock ? 'Edit Block' : 'Add New Block'}
                </h3>
                <button onClick={cancelEdit} style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  width: '32px', 
                  height: '32px', 
                  borderRadius: '8px', 
                  background: 'transparent', 
                  border: 'none', 
                  color: '#9aa0ac', 
                  cursor: 'pointer' 
                }}>
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={addBlock} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {formError && <p style={{ margin: 0, padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#b91c1c', fontSize: '13px' }}>{formError}</p>}
                
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Block Name</label>
                  <input 
                    value={title} 
                    onChange={(e) => setTitle(e.target.value)} 
                    placeholder="e.g. Deep work, Gym, Sleep, Meeting"
                    style={{ 
                      width: '100%', 
                      height: '44px', 
                      padding: '0 14px', 
                      border: '1px solid #e5e7eb', 
                      borderRadius: '10px', 
                      background: '#fafafa', 
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'border-color 0.15s, box-shadow 0.15s'
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = '#4fd19d'}
                    onBlur={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
                  />
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Start Time</label>
                    <input 
                      type="time" 
                      value={start} 
                      onChange={(e) => {
                        const v = e.target.value;
                        setStart(v);
                        if (v && timeToMinutes(v) >= timeToMinutes(end)) {
                          setEnd(minutesToTime(Math.min(timeToMinutes(v) + 60, 24 * 60 - 1)));
                        }
                      }} 
                      style={{ 
                        width: '100%', 
                        height: '44px', 
                        padding: '0 14px', 
                        border: '1px solid #e5e7eb', 
                        borderRadius: '10px', 
                        background: '#fafafa', 
                        fontSize: '14px',
                        outline: 'none'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>End Time</label>
                    <input 
                      type="time" 
                      value={end} 
                      onChange={(e) => setEnd(e.target.value)} 
                      style={{ 
                        width: '100%', 
                        height: '44px', 
                        padding: '0 14px', 
                        border: '1px solid #e5e7eb', 
                        borderRadius: '10px', 
                        background: '#fafafa', 
                        fontSize: '14px',
                        outline: 'none'
                      }}
                    />
                  </div>
                </div>
                
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Type</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {(['Fixed', 'Committed', 'Free'] as TimeBlock['type'][]).map((t) => {
                      const c = typeColors[t];
                      const isSelected = type === t;
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setType(t)}
                          style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            padding: '10px 16px',
                            borderRadius: '10px',
                            background: isSelected ? c.border : c.bg,
                            border: isSelected ? '2px solid ' + c.border : '1px solid ' + c.border,
                            color: isSelected ? '#fff' : c.text,
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.15s'
                          }}
                        >
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: isSelected ? '#fff' : c.dot, opacity: isSelected ? 0.3 : 1 }} />
                          {typeLabels[t]}
                        </button>
                      );
                    })}
                  </div>
                </div>
                
                {type === 'Free' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Free-time category</label>
                    <div style={{ position: 'relative' }}>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value as FreeCategory)}
                        style={{
                          width: '100%',
                          height: '44px',
                          padding: '0 32px 0 14px',
                          border: '1px solid #10b981',
                          borderRadius: '10px',
                          background: '#ecfdf5',
                          color: '#047857',
                          fontSize: '14px',
                          fontWeight: 600,
                          outline: 'none',
                          appearance: 'none',
                          cursor: 'pointer',
                          transition: 'border-color 0.15s, box-shadow 0.15s'
                        }}
                      >
                        {freeCategories.map((c) => <option key={c} value={c}>{categoryLabels[c]}</option>)}
                      </select>
                      <ChevronRight size={16} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%) rotate(90deg)', color: '#10b981', pointerEvents: 'none' }} />
                    </div>
                  </div>
                )}
                
                <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                  <button 
                    type="button" 
                    onClick={cancelEdit}
                    style={{ 
                      flex: 1, 
                      height: '44px', 
                      borderRadius: '10px', 
                      background: '#f3f4f6', 
                      color: '#374151', 
                      border: '1px solid #e5e7eb',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#e5e7eb'}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    style={{ 
                      flex: 1, 
                      height: '44px', 
                      borderRadius: '10px', 
                      background: '#10b981', 
                      color: '#fff', 
                      border: 'none',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#0ea372'}
                  >
                    {editingBlock ? 'Update Block' : 'Add Block'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Floating Add Button (when modal closed) */}
        {!showAddModal && !editingBlock && (
          <button 
            onClick={openAddModal}
            style={{
              position: 'fixed',
              bottom: '24px',
              right: '24px',
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: '#10b981',
              color: '#fff',
              border: 'none',
              boxShadow: '0 4px 20px rgba(16, 185, 129, 0.4)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 20,
              transition: 'transform 0.2s, box-shadow 0.2s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = '0 6px 28px rgba(16, 185, 129, 0.5)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(16, 185, 129, 0.4)'; }}
          >
            <Plus size={24} />
          </button>
        )}
        </>
        )}
      </Panel>

      {weeklyEditorOpen && <WeeklyScheduleModal plan={weeklyPlan} save={setWeeklyPlan} close={() => setWeeklyEditorOpen(false)} />}
    </>
  );
}function WeeklyScheduleModal({ plan, save, close }: { plan: WeeklySchedulePlan | null; save: (plan: WeeklySchedulePlan | null) => void; close: () => void }) {
  const [draft, setDraft] = useState<WeeklySchedulePlan>(() => plan && plan.endsOn >= formatDate() ? plan : createWeeklySchedulePlan());
  const [day, setDay] = useState<(typeof weekdays)[number]>("Monday");
  const [start, setStart] = useState("09:00"); const [end, setEnd] = useState("10:00"); const [title, setTitle] = useState(""); const [type, setType] = useState<TimeBlock["type"]>("Fixed"); const [error, setError] = useState("");
  const dayBlocks = draft.blocks[day] ?? [];
  function t2m(t: string): number { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
  function m2t(mins: number): string { return `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`; }
  function onStartTimeChange(v: string) {
    setStart(v);
    if (v && t2m(v) >= t2m(end)) setEnd(m2t(Math.min(t2m(v) + 60, 24 * 60 - 1)));
  }
  function addTemplateBlock(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !start || !end || start === end || t2m(end) <= t2m(start)) { setError("Add a name and an end time after the start time."); return; }
    setDraft((current) => ({ ...current, blocks: { ...current.blocks, [day]: [...(current.blocks[day] ?? []), { id: uuid(), start, end, title: title.trim(), type }].sort((a, b) => a.start.localeCompare(b.start)) } }));
    setTitle(""); setError("");
  }
  return <div className="modal-wrap"><button className="modal-backdrop" onClick={close} aria-label="Close weekly template" /><section className="modal weekly-modal animate-in"><button className="modal-close" onClick={close}><X size={19} /></button><p className="eyebrow">REPEATABLE RHYTHM</p><h2>Build your weekly template.</h2><p className="modal-copy">These blocks seed the matching weekday whenever you start a day. Choose the end date that fits this person’s schedule.</p><div className="template-dates"><label>Starts <input type="date" value={draft.startsOn} onChange={(e) => setDraft((current) => ({ ...current, startsOn: e.target.value }))} /></label><label>Repeats until <input type="date" min={draft.startsOn} value={draft.endsOn} onChange={(e) => setDraft((current) => ({ ...current, endsOn: e.target.value }))} /></label></div><label className="template-day">Weekday<select value={day} onChange={(e) => setDay(e.target.value as (typeof weekdays)[number])}>{weekdays.map((item) => <option key={item}>{item}</option>)}</select></label><div className="template-blocks">{dayBlocks.length ? dayBlocks.map((block) => <div key={block.id}><span>{block.start}–{block.end}</span><b>{block.title}</b><small>{block.type}</small><button className="inline-delete" aria-label={`Delete ${block.title}`} onClick={() => setDraft((current) => ({ ...current, blocks: { ...current.blocks, [day]: current.blocks[day].filter((item) => item.id !== block.id) } }))}><Trash2 size={15} /></button></div>) : <p className="blank-line">No repeating blocks for {day} yet.</p>}</div><form className="template-form" onSubmit={addTemplateBlock}><input type="time" value={start} onChange={(e) => onStartTimeChange(e.target.value)} /><input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Class, gym, commute…" /><select value={type} onChange={(e) => setType(e.target.value as TimeBlock["type"])}><option>Fixed</option><option>Committed</option><option>Free</option></select><button className="secondary-button" type="submit"><Plus size={15} /> Add</button></form>{error && <p className="form-error">{error}</p>}<div className="detail-footer"><button className="danger-button" onClick={() => { if (confirm("Clear this weekly schedule template?")) save(null); close(); }}><Trash2 size={15} /> Clear template</button><button className="primary-button" onClick={() => { save(draft); close(); }}>Save weekly template</button></div></section></div>;
}

function NinePmCheckModal({ missing, dismiss }: { missing: string[]; dismiss: () => void }) {
  return <div className="modal-wrap"><button className="modal-backdrop" onClick={dismiss} aria-label="Close 9 PM check-in" /><section className="modal checkin-modal animate-in"><p className="eyebrow amber">9 PM EVIDENCE CHECK</p><h2>Do not let the day become a blur.</h2><p className="modal-copy">Before the review, DailyArc still needs:</p><ul>{missing.map((item) => <li key={item}>{item}</li>)}</ul><div className="truth-callout"><CircleAlert size={18} /><span>Open the relevant section, record the facts, then save the end-day review. Missing evidence is not automatically failure; pretending it does not matter is.</span></div><button className="primary-button full" onClick={dismiss}>I’ll complete this now <ArrowRight size={17} /></button></section></div>;
}

function HistoryView({ history, setHistory }: { history: DayRecord[]; setHistory: React.Dispatch<React.SetStateAction<DayRecord[]>> }) {
  const [query, setQuery] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [selectedDay, setSelectedDay] = useState<DayRecord | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const filtered = history.filter((record) => (record.date.includes(query) || record.note.toLowerCase().includes(query.toLowerCase())) && record.score >= minScore);
  const average = history.length ? Math.round(history.reduce((sum, record) => sum + record.score, 0) / history.length) : 0;
  function exportData() { const file = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), history }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(file); const link = document.createElement("a"); link.href = url; link.download = `dailyarc-backup-${formatDate()}.json`; link.click(); URL.revokeObjectURL(url); }
  function importData(event: React.ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const parsed = JSON.parse(String(reader.result)); if (!Array.isArray(parsed.history)) throw new Error("Invalid backup"); const records = parsed.history.filter((item: unknown) => typeof item === "object" && item !== null && "id" in item && "date" in item && "score" in item) as DayRecord[]; if (confirm(`Restore ${records.length} saved record${records.length === 1 ? "" : "s"}? This replaces the archive currently in this browser.`)) setHistory(records); } catch { alert("That file is not a valid DailyArc backup."); } }; reader.readAsText(file); event.target.value = ""; }
  function deleteDay(day: DayRecord) { if (confirm(`Delete your saved record for ${prettyDate(day.date)}?`)) { setHistory((days) => days.filter((item) => item.id !== day.id)); setSelectedDay(null); } }
  return <div className="content animate-in"><section className="page-intro"><div><p className="eyebrow">LONG-TERM ANALYSIS</p><h2>Patterns, not performance theatre.</h2><p>Every record below came from an end-day review you saved on this device. Click any square to inspect the exact priorities, schedule, and evidence from that day.</p></div><div className="backup-actions"><button className="secondary-button" onClick={exportData}><Download size={16} /> Export backup</button><button className="secondary-button" onClick={() => fileRef.current?.click()}><Upload size={16} /> Restore backup</button><input ref={fileRef} className="hidden-input" type="file" accept="application/json" onChange={importData} /></div></section><section className="metrics-grid"><Metric icon={<BarChart3 />} label="Average score" value={history.length ? `${average}` : "—"} suffix={history.length ? "/100" : ""} detail={history.length ? `${history.length} saved day${history.length > 1 ? "s" : ""}` : "No records yet"} tone="mint" /><Metric icon={<Flame />} label="Best score" value={history.length ? `${Math.max(...history.map((day) => day.score))}` : "—"} suffix={history.length ? "/100" : ""} detail="No estimates" tone="coral" /></section><Panel title="Saved daily records" icon={<History size={19} />} action={<span className="count-pill">{filtered.length} shown</span>}><div className="archive-filters"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a date or reflection" /><label>Minimum score<input type="number" min="0" max="100" value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} /></label></div>{filtered.length ? <div className="records-grid">{filtered.map((day) => {
  const completed = day.tasks.filter((task) => task.complete).length;
  const scoreColor = day.score >= 75 ? '#2d9f7d' : day.score >= 50 ? '#c6802a' : '#b56352';
  const scoreBg = day.score >= 75 ? '#daf5ea' : day.score >= 50 ? '#fff7e9' : '#fff0ed';
  const dayNum = new Date(`${day.date}T12:00:00`).getDate();
  const monthShort = new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(`${day.date}T12:00:00`));
  return (
    <button key={day.id} className="record-square" onClick={() => setSelectedDay(day)} aria-label={`Open record for ${prettyDate(day.date)}`}>
      <span className="record-square-score" style={{ color: scoreColor, background: scoreBg }}>{day.score}</span>
      <span className="record-square-date"><b>{dayNum}</b><small>{monthShort}</small></span>
      <span className="record-square-meta">
        <i>{day.sleep}h sleep</i>
        <i>{completed}/{day.tasks.length} tasks</i>
        <i style={{ color: day.exercise ? '#2d9f7d' : '#9aa0ac' }}>{day.exercise ? 'exercised' : 'no exercise'}</i>
      </span>
    </button>
  );
})}</div> : <div className="archive-empty"><Archive size={26} /><h3>{history.length ? "No records match this filter." : "Your history is empty by design."}</h3><p>{history.length ? "Adjust the search or minimum score." : "Start a day, record your work honestly, and save the end-day review. Your first real record will appear here."}</p></div>}
</Panel>{selectedDay && <RecordDetailModal day={selectedDay} close={() => setSelectedDay(null)} deleteDay={() => deleteDay(selectedDay)} />}</div>;
}

function DeepPracticeView({ practice, setPractice, todayLocal, hasApiKey }: { practice: PracticeState; setPractice: React.Dispatch<React.SetStateAction<PracticeState>>; todayLocal: string; hasApiKey: boolean }) {
  const [newTopic, setNewTopic] = useState("");
  const [newIntention, setNewIntention] = useState("");
  const [sessionTopicId, setSessionTopicId] = useState<string>("");
  const [sessionDate, setSessionDate] = useState(todayLocal);
  const [sessionStart, setSessionStart] = useState(formatTime());
  const [sessionEnd, setSessionEnd] = useState(formatTime());
  const [sessionNote, setSessionNote] = useState("");
  const [sessionDistractions, setSessionDistractions] = useState(0);
  const [logError, setLogError] = useState("");
  const [activeFocus, setActiveFocus] = useState<PracticeTopic | null>(null);
  const [focusSeconds, setFocusSeconds] = useState(0);
  const [focusRunning, setFocusRunning] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [learnTopic, setLearnTopic] = useState<PracticeTopic | null>(null);
  const [learnPhase, setLearnPhase] = useState<"reading" | "quiz" | "result">("reading");

  const activeTopics = practice.topics.filter((t) => !t.archived);
  const archivedTopics = practice.topics.filter((t) => t.archived);
  const allSessions = practice.sessions;
  const sessionsToday = allSessions.filter((s) => s.date === todayLocal);
  const minutesToday = sessionsToday.reduce((sum, s) => sum + s.minutes, 0);
  const totalMinutes = allSessions.reduce((sum, s) => sum + s.minutes, 0);
  const totalSessions = allSessions.length;
  const totalDistractions = allSessions.reduce((sum, s) => sum + s.distractions, 0);
  const averageSession = totalSessions ? Math.round(totalMinutes / totalSessions) : 0;
  const last7Days = Array.from({ length: 7 }).map((_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return formatDate(date);
  });
  const weeklyMinutes = last7Days.map((date) => allSessions.filter((s) => s.date === date).reduce((sum, s) => sum + s.minutes, 0));
  const maxWeekly = Math.max(...weeklyMinutes, 30);

  useEffect(() => {
    if (!focusRunning) return;
    const timer = window.setInterval(() => setFocusSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [focusRunning]);

  function addTopic(event: React.FormEvent) {
    event.preventDefault();
    setLogError("");
    const trimmed = newTopic.trim();
    if (!trimmed) { setLogError("Name your focus topic first."); return; }
    const topic: PracticeTopic = { id: uuid(), title: trimmed, intention: newIntention.trim(), createdAt: new Date().toISOString(), archived: false };
    setPractice((state) => ({ ...state, topics: [...state.topics, topic] }));
    setNewTopic(""); setNewIntention("");
  }

  function archiveTopic(id: string) {
    setPractice((state) => ({ ...state, topics: state.topics.map((t) => t.id === id ? { ...t, archived: true } : t) }));
    if (activeFocus?.id === id) { setActiveFocus(null); setFocusRunning(false); }
  }

  function restoreTopic(id: string) {
    setPractice((state) => ({ ...state, topics: state.topics.map((t) => t.id === id ? { ...t, archived: false } : t) }));
  }

  function deleteTopic(id: string) {
    if (!confirm("Delete this topic and all its logged sessions? This cannot be undone.")) return;
    setPractice((state) => ({ ...state, topics: state.topics.filter((t) => t.id !== id), sessions: state.sessions.filter((s) => s.topicId !== id) }));
  }

  function startFocus(topic: PracticeTopic) {
    setActiveFocus(topic);
    setFocusSeconds(0);
    setFocusRunning(true);
  }

  function endFocus() {
    if (!activeFocus || focusSeconds < 60) {
      if (activeFocus && focusSeconds < 60) setLogError("A practice session must last at least one minute to be recorded.");
      setActiveFocus(null);
      setFocusRunning(false);
      setFocusSeconds(0);
      return;
    }
    const date = todayLocal;
    const minutes = Math.round(focusSeconds / 60);
    const end = formatTime();
    const start = new Date(Date.now() - focusSeconds * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const session: PracticeSession = { id: uuid(), topicId: activeFocus.id, date, start, end, minutes, note: "", distractions: 0, createdAt: new Date().toISOString() };
    setPractice((state) => ({ ...state, sessions: [session, ...state.sessions] }));
    setActiveFocus(null);
    setFocusRunning(false);
    setFocusSeconds(0);
  }

  function cancelFocus() {
    if (focusRunning && focusSeconds >= 60 && !confirm("Discard the running focus timer? No session will be saved.")) return;
    setActiveFocus(null);
    setFocusRunning(false);
    setFocusSeconds(0);
  }

  function startLearnSession(topic: PracticeTopic) {
    setLearnTopic(topic);
    setLearnPhase("reading");
  }

  function finishReading() {
    setLearnPhase("quiz");
  }

  function exitLearnSession() {
    setLearnTopic(null);
    setLearnPhase("reading");
  }

  function logSession(event: React.FormEvent) {
    event.preventDefault();
    setLogError("");
    const topicId = sessionTopicId || activeTopics[0]?.id;
    if (!topicId) { setLogError("Add a topic before logging a session."); return; }
    if (!sessionStart || !sessionEnd || sessionStart === sessionEnd) { setLogError("Choose different start and end times."); return; }
    const minutes = minutesBetween(sessionStart, sessionEnd, sessionDate);
    if (minutes <= 0) { setLogError("End time must be after start time."); return; }
    const topic = practice.topics.find((t) => t.id === topicId);
    if (topic?.archived) { setLogError("Log against an active topic, or restore it first."); return; }
    const session: PracticeSession = {
      id: uuid(),
      topicId,
      date: sessionDate,
      start: sessionStart,
      end: sessionEnd,
      minutes,
      note: sessionNote.trim(),
      distractions: Math.max(0, Math.min(99, sessionDistractions)),
      createdAt: new Date().toISOString(),
    };
    setPractice((state) => ({ ...state, sessions: [session, ...state.sessions] }));
    setSessionNote(""); setSessionDistractions(0); setSessionStart(formatTime()); setSessionEnd(formatTime());
  }

  function deleteSession(id: string) {
    if (!confirm("Delete this practice session?")) return;
    setPractice((state) => ({ ...state, sessions: state.sessions.filter((s) => s.id !== id) }));
  }

  const formatTimer = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  function topicById(id: string) { return practice.topics.find((t) => t.id === id); }
  function topicMinutes(topicId: string) { return allSessions.filter((s) => s.topicId === topicId).reduce((sum, s) => sum + s.minutes, 0); }
  function topicSessions(topicId: string) { return allSessions.filter((s) => s.topicId === topicId); }

  return <div className="content animate-in">
    <section className="page-intro"><div>
      <p className="eyebrow">FOCUSED LEARNING</p>
      <h2>What you repeat, you become.</h2>
      <p>Name the skill you are building, log focused sessions, and let the hours compound. Practice is judged by honest minutes — not by intention or optimism.</p>
    </div></section>

    <section className="metrics-grid">
      <Metric icon={<TimerReset />} label="Today" value={`${minutesToday}`} suffix=" min" detail={`${sessionsToday.length} session${sessionsToday.length === 1 ? "" : "s"}`} tone="mint" />
      <Metric icon={<BookOpen />} label="Active topics" value={`${activeTopics.length}`} suffix="" detail={`Across ${allSessions.length} sessions`} tone="blue" />
      <Metric icon={<Clock3 />} label="Total focused" value={`${Math.floor(totalMinutes / 60)}`} suffix={`h ${totalMinutes % 60}m`} detail="Honest minutes only" tone="lavender" />
      <Metric icon={<Activity />} label="Avg session" value={`${averageSession}`} suffix=" min" detail={`${totalDistractions} distractions logged`} tone="coral" />
    </section>

    {(activeFocus || focusRunning) && activeFocus && (
      <section className="focus-active">
        <div className="focus-active-orb"><TimerReset size={22} /></div>
        <div>
          <p className="eyebrow amber">PRACTICE RUNNING · {activeFocus.title}</p>
          <h2>{formatTimer(focusSeconds)}</h2>
          <p>{activeFocus.intention || "Stay with one thing until the timer stops."}</p>
        </div>
        <div className="focus-active-actions">
          <button className="secondary-button" onClick={() => setFocusRunning((r) => !r)}>{focusRunning ? <><Clock3 size={15} /> Pause</> : <><Activity size={15} /> Resume</>}</button>
          <button className="primary-button" onClick={endFocus}><Check size={16} /> Save session</button>
          <button className="inline-delete" onClick={cancelFocus} aria-label="Cancel focus session"><X size={16} /></button>
        </div>
      </section>
    )}

    <section className="dashboard-grid">
      <div className="left-column">
        <Panel title="Practice topics" icon={<GraduationCap size={19} />} action={<span className="count-pill">{activeTopics.length} active</span>}>
          <p className="panel-intro">Define what you are building deliberately. Each topic tracks focused minutes over time — no estimates, only logged sessions.</p>
          {activeTopics.length ? (
            <div className="topics-list">
              {activeTopics.map((topic) => {
                const minutes = topicMinutes(topic.id);
                const count = topicSessions(topic.id).length;
                const percent = totalMinutes ? Math.min(100, Math.round(minutes / Math.max(1, Math.max(...practice.topics.map((t) => topicMinutes(t.id)))) * 100)) : 0;
                return (
                  <div key={topic.id} className="topic-row">
                    <div className="topic-copy">
                      <b>{topic.title}</b>
                      {topic.intention && <small>{topic.intention}</small>}
                      <span className="topic-meta">{count} session{count === 1 ? "" : "s"} · {Math.floor(minutes / 60)}h {minutes % 60}m</span>
                      <div className="topic-track"><i style={{ width: `${percent}%` }} /></div>
                    </div>
                    <div className="topic-actions">
                      <button className="text-button" onClick={() => startLearnSession(topic)}><Maximize2 size={14} /> Learn</button>
                      <button className="text-button" onClick={() => startFocus(topic)}><TimerReset size={14} /> Focus</button>
                      <button className="inline-delete" aria-label={`Archive ${topic.title}`} onClick={() => archiveTopic(topic.id)}><Archive size={14} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="blank-line">No active topics yet. Add what you are deliberately practising — e.g. &ldquo;System design&rdquo;, &ldquo;Spanish&rdquo;, &ldquo;Algorithms&rdquo;.</p>
          )}
          <form className="add-form" onSubmit={addTopic}>
            <input value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="Topic name (e.g. System design)" />
            <input value={newIntention} onChange={(e) => setNewIntention(e.target.value)} placeholder="Intention / target outcome (optional)" />
            <button className="text-button" type="submit"><Plus size={16} /> Add topic</button>
          </form>
        </Panel>

        <Panel title="Recent practice sessions" icon={<History size={19} />} action={<span className="count-pill">{allSessions.length} logged</span>}>
          {allSessions.length ? (
            <div className="session-list">
              {allSessions.slice(0, 12).map((session) => {
                const topic = topicById(session.topicId);
                return (
                  <div key={session.id} className="session-row">
                    <div className="session-time">
                      <b>{prettyDate(session.date)}</b>
                      <small>{session.start} – {session.end}</small>
                    </div>
                    <div className="session-copy">
                      <b>{topic?.title ?? "Removed topic"}</b>
                      <small>{session.minutes} min focused · {session.distractions} distraction{session.distractions === 1 ? "" : "s"}</small>
                      {session.note && <small className="session-note">{session.note}</small>}
                    </div>
                    <button className="inline-delete" aria-label="Delete session" onClick={() => deleteSession(session.id)}><Trash2 size={14} /></button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="blank-line">No sessions yet. Start a focus timer or log one manually on the right.</p>
          )}
        </Panel>

        {archivedTopics.length > 0 && (
          <Panel title="Archived topics" icon={<Archive size={19} />} action={<button className="text-button" onClick={() => setArchivedOpen((v) => !v)}>{archivedOpen ? "Hide" : "Show"}</button>}>
            {archivedOpen && (
              <div className="session-list">
                {archivedTopics.map((topic) => {
                  const minutes = topicMinutes(topic.id);
                  const count = topicSessions(topic.id).length;
                  return (
                    <div key={topic.id} className="session-row">
                      <div className="session-time"><b>{topic.title}</b><small>{count} session{count === 1 ? "" : "s"} · {Math.floor(minutes / 60)}h {minutes % 60}m</small></div>
                      <div className="topic-actions">
                        <button className="text-button" onClick={() => restoreTopic(topic.id)}><Plus size={14} /> Restore</button>
                        <button className="inline-delete" aria-label={`Delete ${topic.title}`} onClick={() => deleteTopic(topic.id)}><Trash2 size={14} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {!archivedOpen && <p className="blank-line">{archivedTopics.length} archived topic{archivedTopics.length === 1 ? "" : "s"} hidden.</p>}
          </Panel>
        )}
      </div>

      <div className="right-column">
        <Panel title="Weekly focus trend" icon={<BarChart3 size={19} />} action={<span className="time-label">Last 7 days</span>}>
          <div className="chart">
            {last7Days.map((date, index) => {
              const minutes = weeklyMinutes[index];
              const heightPercent = Math.round((minutes / maxWeekly) * 100);
              const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(new Date(`${date}T12:00:00`));
              return (
                <div key={date} className="bar-col">
                  <span>{minutes ? `${minutes}m` : ""}</span>
                  <div className="bar-track"><i style={{ height: `${heightPercent}%` }} /></div>
                  <small>{weekday}</small>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="AI guided learning" icon={<BrainCircuit size={19} />} action={<span className="ai-badge"><Sparkles size={13} /> Coming soon</span>}>
          <p className="panel-intro">Pick a topic and click <b>Learn</b> on any topic row. The session opens full screen. When you finish reading, the LLM will quiz you with topic-specific questions. Pass the quiz to earn focus points; close any time to exit.</p>
          <div className="dev-placeholder"><Zap size={24} /><span>LLM is coming soon — your OpenAI API key (saved per user in Users & OpenAI) will power the topic MCQ quiz after your reading session.</span></div>
          <div className="signal-row"><div><span>OpenAI key status</span><b>{hasApiKey ? "Ready" : "Add key first"}</b></div><div className="signal-track mint"><i style={{ width: hasApiKey ? "100%" : "30%" }} /></div></div>
        </Panel>

        <Panel title="Log a past session" icon={<CheckCircle2 size={19} />} action={<span className="time-label">Manual entry</span>}>
          <p className="panel-intro">Record a completed focus block you did not time live. Times become minutes automatically.</p>
          {logError && <p className="form-error" role="alert">{logError}</p>}
          <form className="practice-log-form" onSubmit={logSession}>
            <label>Topic
              <select value={sessionTopicId} onChange={(e) => setSessionTopicId(e.target.value)}>
                {activeTopics.map((topic) => <option key={topic.id} value={topic.id}>{topic.title}</option>)}
                {!activeTopics.length && <option value="" disabled>Add a topic first…</option>}
              </select>
            </label>
            <label>Date<input type="date" value={sessionDate} max={todayLocal} onChange={(e) => setSessionDate(e.target.value)} /></label>
            <div className="form-grid">
              <label>Start<input type="time" value={sessionStart} onChange={(e) => setSessionStart(e.target.value)} /></label>
              <label>End<input type="time" value={sessionEnd} onChange={(e) => setSessionEnd(e.target.value)} /></label>
            </div>
            <label>Distractions
              <input type="number" min="0" max="99" value={sessionDistractions} onChange={(e) => setSessionDistractions(Number(e.target.value))} />
            </label>
            <label>What did you focus on?
              <textarea value={sessionNote} onChange={(e) => setSessionNote(e.target.value)} placeholder="One line — what was the actual work and outcome?" />
            </label>
            <button className="primary-button full" type="submit" disabled={!activeTopics.length}><Check size={15} /> Log session <span className="timer-minutes">{minutesBetween(sessionStart, sessionEnd, sessionDate)} min</span></button>
          </form>
        </Panel>

        <Panel title="How to practise honestly" icon={<Sparkles size={19} />} action={<span className="ai-badge"><BrainCircuit size={13} /> Rule-based</span>}>
          <div className="coach-card"><div className="coach-icon"><Zap size={19} /></div><div><p className="coach-title">Focused learning rules</p>
            <p>One topic per session. No tabs, no notifications. Stop the timer when attention breaks. The minutes you log here must be minutes you actually focused — the rest is theatre.</p></div></div>
          <div className="signal-row"><div><span>Consistency beats intensity</span><b>{weeklyMinutes.filter((m) => m > 0).length}/7 days</b></div><div className="signal-track mint"><i style={{ width: `${(weeklyMinutes.filter((m) => m > 0).length / 7) * 100}%` }} /></div></div>
          <div className="signal-row"><div><span>Clean focus ratio</span><b>{allSessions.length ? `${Math.max(0, 100 - Math.round(totalDistractions / (allSessions.length || 1) * 20))}%` : "—"}</b></div><div className="signal-track"><i style={{ width: `${allSessions.length ? Math.max(8, 100 - Math.round(totalDistractions / (allSessions.length || 1) * 20)) : 0}%` }} /></div></div>
        </Panel>
      </div>
    </section>
    {learnTopic && <LearnSessionOverlay topic={learnTopic} phase={learnPhase} hasApiKey={hasApiKey} onFinishReading={finishReading} onExit={exitLearnSession} />}
  </div>;
}

function LearnSessionOverlay({ topic, phase, hasApiKey, onFinishReading, onExit }: { topic: PracticeTopic; phase: "reading" | "quiz" | "result"; hasApiKey: boolean; onFinishReading: () => void; onExit: () => void }) {
  return (
    <div className="learn-wrap">
      <button className="learn-backdrop" onClick={onExit} aria-label="Close learning session" />
      <section className="learn-modal">
        <header className="learn-header">
          <div className="learn-header-left">
            <span className="learn-header-orb"><GraduationCap size={22} /></span>
            <div>
              <p className="eyebrow amber">AI GUIDED LEARNING</p>
              <h2>{topic.title}</h2>
            </div>
          </div>
          <button className="learn-close" onClick={onExit} aria-label="Close"><X size={20} /></button>
        </header>

        <div className="learn-stage">
          <div className="learn-coming-soon">
            <div className="learn-coming-soon-orb"><Sparkles size={42} /></div>
            <h3>LLM coming soon</h3>
            <p>This big-screen learning surface will soon host a guided reading + MCQ session for &ldquo;{topic.title}&rdquo;. Earn focus points when you answer the LLM&rsquo;s topic questions correctly.</p>
            {topic.intention && <span className="learn-intention">Your intention: {topic.intention}</span>}
          </div>

          {phase === "reading" ? (
            <div className="learn-actions">
              <button className="primary-button" onClick={onFinishReading}><Check size={16} /> I have finished reading <ArrowRight size={16} /></button>
              <button className="secondary-button" onClick={onExit}><X size={15} /> Exit</button>
            </div>
          ) : (
            <>
              <div className="learn-llm-status">
                <KeyRound size={17} />
                <span>OpenAI API key: <b>{hasApiKey ? "configured" : "not set — add one in Users & OpenAI"}</b></span>
              </div>
              <div className="learn-actions">
                <button className="secondary-button" onClick={onExit}><X size={15} /> Exit session</button>
              </div>
            </>
          )}
        </div>

        <p className="learn-footer">DailyArc · LLM-powered learning arrives soon</p>
      </section>
    </div>
  );
}

function RecordDetailModal({ day, close, deleteDay }: { day: DayRecord; close: () => void; deleteDay: () => void }) {
  const completed = day.tasks.filter((task) => task.complete).length;
  const completedGoals = day.goals?.filter((g) => g.enabled && g.completed).length ?? 0;
  const totalEnabledGoals = day.goals?.filter((g) => g.enabled).length ?? 0;
  const schedule = day.schedule ?? [];
  const totalScheduledHours = schedule.reduce((sum, b) => sum + hoursBetween(b.start, b.end), 0);
  const learningHours = schedule
    .filter(b => b.type === "Free" && /study|learn|work|code|read|project|skill/i.test(b.title))
    .reduce((sum, b) => sum + hoursBetween(b.start, b.end), 0);
  const workoutHours = schedule
    .filter(b => b.type === "Free" && /workout|gym|exercise|run|walk|yoga|sport|fitness/i.test(b.title))
    .reduce((sum, b) => sum + hoursBetween(b.start, b.end), 0);
  const screenTime = day.screenTime ?? 0;
  const timeWasted = Math.max(0, screenTime - 1);

  const typeColors = {
    Fixed: { bg: '#fef2f2', border: '#ef4444', text: '#b91c1c', dot: '#ef4444', label: 'Fixed' },
    Committed: { bg: '#fefce8', border: '#eab308', text: '#a16207', dot: '#eab308', label: 'Committed' },
    Free: { bg: '#ecfdf5', border: '#10b981', text: '#047857', dot: '#10b981', label: 'Free' }
  };

  function timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  function formatTimeRange(start: string, end: string): string {
    const s = timeToMinutes(start);
    const e = timeToMinutes(end);
    const h = Math.floor((e - s) / 60);
    const m = (e - s) % 60;
    return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
  }

  function getBlockPosition(block: TimeBlock) {
    const startMins = timeToMinutes(block.start);
    const endMins = timeToMinutes(block.end);
    const top = (startMins / (24 * 60)) * 100;
    const height = Math.max(3, ((endMins - startMins) / (24 * 60)) * 100);
    return { top: top + '%', height: height + '%' };
  }

  const scoreColor = day.score >= 75 ? '#2d9f7d' : day.score >= 50 ? '#c6802a' : '#b56352';
  const scoreBg = day.score >= 75 ? '#daf5ea' : day.score >= 50 ? '#fff7e9' : '#fff0ed';

  return (
    <div className="modal-wrap">
      <button className="modal-backdrop" onClick={close} aria-label="Close day details" />
      <section className="modal day-detail animate-in" style={{ width: 'min(800px, 100%)', maxHeight: 'calc(100vh - 36px)', overflow: 'auto' }}>
        <button className="modal-close" onClick={close}><X size={19} /></button>
        <p className="eyebrow">PAST DAY · {prettyDate(day.date)}</p>
        
        <div className="detail-heading" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px', marginBottom: '24px', paddingRight: '30px' }}>
          <div>
            <h2 style={{ margin: '0 0 8px', fontSize: '23px' }}>Daily score {day.score}/100</h2>
            <p style={{ maxWidth: '450px', margin: 0, color: '#7e8494', fontSize: '11px', lineHeight: 1.6 }}>
              Saved evidence from this day. It cannot be edited here, only reviewed or deleted.
            </p>
          </div>
          <div 
            className={`record-score ${day.score >= 75 ? "strong-score" : ""}`}
            style={{
              width: '72px', height: '72px', borderRadius: '14px', flexShrink: 0,
              display: 'grid', placeItems: 'center',
              fontWeight: 800, fontSize: '22px', fontFamily: '"DM Mono", monospace',
              color: scoreColor, background: scoreBg
            }}
          >
            {day.score}
          </div>
        </div>

        {/* Metrics Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '24px' }}>
          <div style={{ padding: '12px', border: '1px solid #eceef3', borderRadius: '8px', background: '#fbfbfd' }}>
            <div style={{ color: '#8a90a0', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Sleep</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#424958', fontFamily: '"DM Mono", monospace' }}>{day.sleep} hrs</div>
          </div>
          <div style={{ padding: '12px', border: '1px solid #eceef3', borderRadius: '8px', background: '#fbfbfd' }}>
            <div style={{ color: '#8a90a0', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Deep Work</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#6078e9', fontFamily: '"DM Mono", monospace' }}>{day.deepWork} hrs</div>
          </div>
          <div style={{ padding: '12px', border: '1px solid #eceef3', borderRadius: '8px', background: '#fbfbfd' }}>
            <div style={{ color: '#8a90a0', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Focus</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#6078e9', fontFamily: '"DM Mono", monospace' }}>{day.focus} hrs</div>
          </div>
          <div style={{ padding: '12px', border: '1px solid #eceef3', borderRadius: '8px', background: '#fbfbfd' }}>
            <div style={{ color: '#8a90a0', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Coding</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#8776dc', fontFamily: '"DM Mono", monospace' }}>{day.coding} hrs</div>
          </div>
          <div style={{ padding: '12px', border: '1px solid #eceef3', borderRadius: '8px', background: '#fbfbfd' }}>
            <div style={{ color: '#8a90a0', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Phone Use</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#e77462', fontFamily: '"DM Mono", monospace' }}>{day.phone} hrs</div>
          </div>
          <div style={{ padding: '12px', border: '1px solid #eceef3', borderRadius: '8px', background: '#fbfbfd' }}>
            <div style={{ color: '#8a90a0', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Screen Time</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#e77462', fontFamily: '"DM Mono", monospace' }}>{screenTime} hrs</div>
          </div>
          <div style={{ padding: '12px', border: '1px solid #eceef3', borderRadius: '8px', background: '#fbfbfd' }}>
            <div style={{ color: '#8a90a0', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Time Wasted</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#e77462', fontFamily: '"DM Mono", monospace' }}>{timeWasted.toFixed(1)} hrs</div>
          </div>
          <div style={{ padding: '12px', border: '1px solid #eceef3', borderRadius: '8px', background: '#fbfbfd' }}>
            <div style={{ color: '#8a90a0', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Exercise</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#8776dc', fontFamily: '"DM Mono", monospace' }}>{day.exercise ? 'Yes' : 'No'}</div>
          </div>
          {totalEnabledGoals > 0 && (
            <div style={{ padding: '12px', border: '1px solid #eceef3', borderRadius: '8px', background: '#fbfbfd' }}>
              <div style={{ color: '#8a90a0', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Goals Met</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#2d9f7d', fontFamily: '"DM Mono", monospace' }}>{completedGoals}/{totalEnabledGoals}</div>
            </div>
          )}
        </div>

        {/* Basic Details Grid */}
        <div className="detail-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '24px' }}>
          <div style={{ padding: '10px', border: '1px solid #eceef3', borderRadius: '8px', background: '#fbfbfd' }}>
            <span style={{ color: '#8a90a0', fontSize: '9px' }}>Start Time</span>
            <b style={{ color: '#424958', fontSize: '11px' }}>{day.wakeTime ?? "Not recorded"}</b>
          </div>
          <div style={{ padding: '10px', border: '1px solid #eceef3', borderRadius: '8px', background: '#fbfbfd' }}>
            <span style={{ color: '#8a90a0', fontSize: '9px' }}>Bedtime</span>
            <b style={{ color: '#424958', fontSize: '11px' }}>{day.sleepTime || "Not recorded"}</b>
          </div>
          <div style={{ padding: '10px', border: '1px solid #eceef3', borderRadius: '8px', background: '#fbfbfd' }}>
            <span style={{ color: '#8a90a0', fontSize: '9px' }}>Priorities</span>
            <b style={{ color: '#424958', fontSize: '11px' }}>{completed}/{day.tasks.length} complete</b>
          </div>
          <div style={{ padding: '10px', border: '1px solid #eceef3', borderRadius: '8px', background: '#fbfbfd' }}>
            <span style={{ color: '#8a90a0', fontSize: '9px' }}>Scheduled</span>
            <b style={{ color: '#424958', fontSize: '11px' }}>{totalScheduledHours > 0 ? totalScheduledHours + 'h ' + (totalScheduledHours % 1) * 60 + 'm' : '0h'}</b>
          </div>
        </div>

        {/* Priorities */}
        <section className="detail-section" style={{ marginBottom: '24px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 700, color: '#303442' }}>Priorities</h3>
          {day.tasks.length ? (
            <div className="detail-list" style={{ display: 'grid', gap: '8px' }}>
              {day.tasks.map((task) => (
                <div key={task.id} style={{ 
                  display: 'grid', gridTemplateColumns: '28px 1fr', gap: '10px', alignItems: 'start',
                  padding: '10px 12px', border: '1px solid #eeeef2', borderRadius: '8px', background: task.complete ? '#f4fbf8' : '#fff'
                }}>
                  <span className={task.complete ? "detail-check complete" : "detail-check"} style={{ display: 'grid', placeItems: 'center', marginTop: '2px' }}>
                    {task.complete && <Check size={12} />}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <b style={{ color: task.complete ? '#808695' : '#303442', fontSize: '12px', textDecoration: task.complete ? 'line-through' : 'none' }}>{task.title}</b>
                    <div style={{ color: '#9a9ead', fontSize: '10px', marginTop: '2px' }}>{task.meta}</div>
                    <span className={`impact ${task.impact}`} style={{ display: 'inline-block', marginTop: '4px', padding: '2px 6px', borderRadius: '4px', fontSize: '8px', fontWeight: 800, textTransform: 'capitalize' }}>
                      {task.impact}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="detail-empty" style={{ color: '#8a90a0', fontSize: '11px', padding: '16px', textAlign: 'center', background: '#fbfbfd', border: '1px dashed #d8dce5', borderRadius: '8px' }}>
              No priorities were added that day.
            </p>
          )}
        </section>

        {/* Goals */}
        {day.goals && day.goals.length > 0 && (
          <section className="detail-section" style={{ marginBottom: '24px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 700, color: '#303442' }}>Personal Goals</h3>
            <div style={{ display: 'grid', gap: '8px' }}>
              {day.goals.map((goal) => (
                <div key={goal.id} style={{ 
                  display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: '10px', alignItems: 'center',
                  padding: '10px 12px', border: '1px solid #eeeef2', borderRadius: '8px', background: goal.enabled ? (goal.completed ? '#f4fbf8' : '#fbfbfd') : '#fafafa'
                }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'default' }}>
                    <input type="checkbox" checked={goal.completed} disabled style={{ width: '16px', height: '16px', accentColor: '#5fd2ad' }} />
                  </label>
                  <span style={{ 
                    color: goal.enabled ? (goal.completed ? '#2d9f7d' : '#303442') : '#b5b9c6',
                    fontSize: '12px', fontWeight: goal.completed ? 600 : 400,
                    textDecoration: goal.completed ? 'line-through' : 'none'
                  }}>
                    <b>{goal.label}</b>
                  </span>
                  <span className={`goal-status ${goal.enabled ? (goal.completed ? 'goal-met' : 'goal-unmet') : ''}`} 
                    style={{ 
                      fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', 
                      padding: '3px 8px', borderRadius: '5px',
                      background: goal.enabled ? (goal.completed ? '#daf5ea' : '#fff7e9') : '#f0f0f0',
                      color: goal.enabled ? (goal.completed ? '#2d9f7d' : '#c6802a') : '#b5b9c6'
                    }}>
                    {goal.enabled ? (goal.completed ? 'Achieved +2' : 'Pending') : 'Disabled'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Time Blueprint - Visual Timeline */}
        <section className="detail-section" style={{ marginBottom: '24px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '13px', fontWeight: 700, color: '#303442' }}>Time Blueprint</h3>
          {schedule.length > 0 ? (
            <div style={{ position: 'relative', minHeight: '350px', background: '#fafbfd', borderRadius: '12px', border: '1px solid #e9ebf0', overflow: 'hidden' }}>
              {/* Hour markers */}
              <div style={{ position: 'absolute', left: '0', top: '0', bottom: '0', width: '60px', background: '#f8fafc', borderRight: '1px solid #e9ebf0' }}>
                <div style={{ position: 'absolute', left: '0', right: '0', top: '0', bottom: '0', background: 'repeating-linear-gradient(to bottom, transparent, transparent 4.166%, #f0f2f5 4.166%, #f0f2f5 4.167%)' }} />
                {Array.from({ length: 24 }).map((_, h) => (
                  <div key={h} style={{ position: 'absolute', top: (h / 24) * 100 + '%', left: '0', width: '60px', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', paddingTop: '1px', paddingRight: '12px' }}>
                    <span style={{ fontSize: '10px', color: '#9aa0ac', fontFamily: '"DM Mono", monospace', fontWeight: 600, background: '#f8fafc', padding: '1px 4px', borderRadius: '3px', border: '1px solid #e9ebf0' }}>
                      {String(h).padStart(2, '0')}:00
                    </span>
                  </div>
                ))}
              </div>

              {/* Grid lines */}
              <div style={{ position: 'absolute', left: '60px', right: '0', top: '0', bottom: '0', pointerEvents: 'none' }}>
                {Array.from({ length: 24 }).map((_, h) => (
                  <div key={h} style={{ position: 'absolute', top: (h / 24) * 100 + '%', left: '0', right: '0', height: '1px', background: h % 2 === 0 ? '#e9ebf0' : '#f0f2f5' }} />
                ))}
              </div>

              {/* Blocks */}
              <div style={{ position: 'absolute', left: '60px', right: '16px', top: '0', bottom: '0' }}>
                {schedule.sort((a, b) => a.start.localeCompare(b.start)).map((block) => {
                  const pos = getBlockPosition(block);
                  const colors = typeColors[block.type];
                  const duration = formatTimeRange(block.start, block.end);
                  
                  return (
                    <div
                      key={block.id}
                      style={{
                        position: 'absolute',
                        left: '0',
                        right: '0',
                        top: pos.top,
                        height: pos.height,
                        minHeight: '36px',
                        background: colors.bg,
                        border: '1px solid ' + colors.border,
                        borderRadius: '10px',
                        padding: '10px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                        zIndex: 1
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            padding: '3px 10px', borderRadius: '12px', fontSize: '11px',
                            fontWeight: 700, background: colors.border, color: '#fff'
                          }}>
                            {colors.label}
                          </span>
                        </div>
                      </div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#1a1d29', marginBottom: '4px' }}>
                        {block.title || <span style={{ color: '#9aa0ac', fontWeight: 400 }}>Untitled</span>}
                      </div>
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        fontFamily: '"DM Mono", monospace', fontSize: '11px', fontWeight: 600, color: colors.text,
                        background: 'rgba(255,255,255,0.7)', padding: '3px 10px', borderRadius: '6px',
                        border: '1px solid ' + colors.border
                      }}>
                        {block.start} – {block.end} <span style={{ fontSize: '9px', opacity: 0.7 }}>({duration})</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="detail-empty" style={{ color: '#8a90a0', fontSize: '11px', padding: '40px', textAlign: 'center', background: '#fbfbfd', border: '1px dashed #d8dce5', borderRadius: '8px' }}>
              No time blocks were recorded that day.
            </p>
          )}
        </section>

        {/* Schedule Summary Stats */}
        {schedule.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '24px' }}>
            <div style={{ padding: '10px 11px', border: '1px solid #e8ebf2', borderRadius: '8px', background: '#fafbfe' }}>
              <span style={{ color: '#8a90a0', fontSize: '9px', fontWeight: 700 }}>Total Scheduled</span>
              <b style={{ color: '#3d4455', fontSize: '14px' }}>{totalScheduledHours}h</b>
            </div>
            <div style={{ padding: '10px 11px', border: '1px solid #e8ebf2', borderRadius: '8px', background: '#fafbfe' }}>
              <span style={{ color: '#8a90a0', fontSize: '9px', fontWeight: 700 }}>Learning Time</span>
              <b style={{ color: '#6078e9', fontSize: '14px' }}>{learningHours.toFixed(1)}h</b>
            </div>
            <div style={{ padding: '10px 11px', border: '1px solid #e8ebf2', borderRadius: '8px', background: '#fafbfe' }}>
              <span style={{ color: '#8a90a0', fontSize: '9px', fontWeight: 700 }}>Workout Time</span>
              <b style={{ color: '#8776dc', fontSize: '14px' }}>{workoutHours.toFixed(1)}h</b>
            </div>
          </div>
        )}

        {/* Reflection */}
        <section className="detail-section" style={{ marginBottom: '24px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 700, color: '#303442' }}>Reflection</h3>
          <p className="reflection-detail" style={{ 
            color: '#424958', fontSize: '12px', lineHeight: 1.7, 
            padding: '16px', background: '#fbfbfd', border: '1px solid #eceef3', borderRadius: '8px',
            whiteSpace: 'pre-wrap', minHeight: '80px'
          }}>
            {day.note || "No written reflection was saved."}
          </p>
        </section>

        <div className="detail-footer" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid #eceef3' }}>
          <button className="danger-button" onClick={deleteDay} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '8px', background: '#fff0ed', color: '#c00', border: '1px solid #fee', fontWeight: 600 }}>
            <Trash2 size={15} /> Delete this record
          </button>
          <button className="secondary-button" onClick={close} style={{ padding: '10px 16px' }}>Close details</button>
        </div>
      </section>
    </div>
  );
}

function StartDayModal({ now, previousRecord, close, start }: { now: Date; previousRecord?: DayRecord; close: () => void; start: (values: StartForm) => void }) {
  const [useClockTime, setUseClockTime] = useState(true);
  const hasPreviousBedtime = Boolean(previousRecord?.sleepTime);
  const isFirstDay = !hasPreviousBedtime;
  const [useCalculatedSleep, setUseCalculatedSleep] = useState(!isFirstDay);
  
  // Calculate sleep duration: (previous day's sleepTime to current wakeTime) - 1 hour
  const calculateSleep = (prevSleepTime: string, currWakeTime: string) => {
    const hours = sleepHoursBetween(prevSleepTime, currWakeTime);
    return Math.max(0, hours - 1);
  };

  const [form, setForm] = useState<StartForm>({ 
    wakeTime: formatTime(now), 
    sleep: hasPreviousBedtime ? calculateSleep(previousRecord!.sleepTime!, formatTime(now)) : 7.5 
  });
  
  const updateWakeTime = (wakeTime: string) => setForm((current) => ({ 
    ...current, 
    wakeTime, 
    sleep: useCalculatedSleep && previousRecord?.sleepTime ? calculateSleep(previousRecord.sleepTime, wakeTime) : current.sleep 
  }));
  
  useEffect(() => {
    if (!useClockTime || isFirstDay) return;
    const wakeTime = formatTime(now);
    setForm((current) => ({ 
      ...current, 
      wakeTime, 
      sleep: useCalculatedSleep && previousRecord?.sleepTime ? calculateSleep(previousRecord.sleepTime, wakeTime) : current.sleep 
    }));
  }, [now, previousRecord?.sleepTime, useCalculatedSleep, useClockTime, isFirstDay]);
  
  const clockText = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return <div className="modal-wrap"><button className="modal-backdrop" onClick={close} aria-label="Close start day dialog" /><section className="modal animate-in"><button className="modal-close" onClick={close}><X size={19} /></button><p className="eyebrow amber">START DAY · REAL BASELINE</p><h2>Set the conditions you actually have.</h2><p className="modal-copy">DailyArc has read your device clock. Use it as the start-day time, or change it if you need the record to reflect a different time.</p><div className="clock-choice"><div><Clock3 size={18} /><span>Current device time <b>{clockText}</b></span></div><label><input type="checkbox" checked={useClockTime} onChange={(event) => setUseClockTime(event.target.checked)} /> Use this time</label></div>{hasPreviousBedtime && <label className="sleep-source"><span>Last saved bedtime: <b>{previousRecord!.sleepTime}</b></span><span><input type="checkbox" checked={useCalculatedSleep} onChange={(event) => { const checked = event.target.checked; setUseCalculatedSleep(checked); if (checked) setForm((current) => ({ ...current, sleep: calculateSleep(previousRecord!.sleepTime!, current.wakeTime) })); }} /> Calculate sleep automatically (previous bedtime to wake time - 1hr)</span></label>}<div className="form-grid"><label>Start-day time<input type="time" value={form.wakeTime} disabled={useClockTime} onChange={(e) => { setUseClockTime(false); updateWakeTime(e.target.value); }} /></label><label>Sleep duration {useCalculatedSleep && <small>calculated (prev bedtime → wake - 1hr)</small>}<input type="number" min="0" max="16" step="0.25" value={form.sleep} disabled={useCalculatedSleep} onChange={(e) => setForm({ ...form, sleep: Number(e.target.value) })} /></label></div><div className="truth-callout"><CircleAlert size={18} /><span>Free blocks are judged; fixed commitments are context. Add both so the review stays fair.</span></div><button className="primary-button full" onClick={() => start(form)}>Initialize real day <ArrowRight size={17} /></button></section></div>;
}

function Panel({ title, icon, action, children }: { title: string; icon: React.ReactNode; action: React.ReactNode; children: React.ReactNode }) { return <section className="panel"><header className="panel-header"><div className="panel-title"><span>{icon}</span><h3>{title}</h3></div>{action}</header>{children}</section>; }
function Metric({ icon, label, value, suffix, detail, tone }: { icon: React.ReactNode; label: string; value: string; suffix: string; detail: string; tone: string }) { return <article className={`metric-card ${tone}`}><div className="metric-icon">{icon}</div><p>{label}</p><h3>{value}<small>{suffix}</small></h3><span>{detail}</span></article>; }
