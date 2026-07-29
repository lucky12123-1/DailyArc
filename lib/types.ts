export type Task = {
  id: string;
  title: string;
  meta: string;
  complete: boolean;
  impact: "high" | "medium" | "low";
  deadline?: string;
};

export type Goal = {
  id: string;
  label: string;
  type: "custom" | "wake";
  enabled: boolean;
  completed: boolean;
  target?: string;
};

export type DailyProgramming = {
  prompt: string;
  answer: string;
  result: "pending" | "correct" | "incorrect";
  submittedAnswer?: string;
};

export type ActiveDay = {
  id: string;
  date: string;
  wakeTime: string;
  sleep: number;
  mood?: number;
  energy?: number;
  tasks: Task[];
  screenTime: number;
  exercise: boolean;
  reflection: string;
  sleepTime: string;
  startPoints: number;
  dailyProgramming: DailyProgramming;
  goals: Goal[];
  recoveryMission?: { id: string; createdAt: string; deadline: string; title: string };
  ninePmCheck?: { checkedAt: string; missing: string[]; dismissed: boolean };
  deepWork?: number;
  phone?: number;
  schedule?: { id: string; start: string; end: string; title: string; type: "Fixed" | "Committed" | "Free"; category?: string }[];
};

export type DayRecord = {
  id: string;
  date: string;
  wakeTime?: string;
  mood?: number;
  energy?: number;
  sleepTime?: string;
  score: number;
  sleep: number;
  wastedHours: number;
  exercise: boolean;
  note: string;
  tasks: Task[];
  screenTime: number;
  goals: Goal[];
  deepWork: number;
  phone: number;
  focus: number;
  coding: number;
  schedule?: TimeBlock[];
};

export type WeeklySchedulePlan = {
  startsOn: string;
  endsOn: string;
  blocks: Record<string, { id: string; start: string; end: string; title: string; type: "Fixed" | "Committed" | "Free"; category?: string }[]>;
};

export type TimeBlock = {
  id: string;
  start: string;
  end: string;
  title: string;
  type: "Fixed" | "Committed" | "Free";
  category?: string;
};

export const freeCategories = ["self_study/work", "workout", "sleep", "other"] as const;
export type FreeCategory = (typeof freeCategories)[number];

export const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export type ScoreBreakdown = {
  total: number;
  priorities: number;
  blueprint: number;
  goals: number;
  sleep: number;
};

export type ScoreInput = {
  tasks: Task[];
  goals: Goal[];
  schedule: TimeBlock[];
  sleep: number;
  freeHours?: number;
};

export type PracticeTopic = {
  id: string;
  title: string;
  intention: string;
  createdAt: string;
  archived: boolean;
};

export type PracticeSession = {
  id: string;
  topicId: string;
  date: string;
  start: string;
  end: string;
  minutes: number;
  note: string;
  distractions: number;
  createdAt: string;
};

export type PracticeState = {
  topics: PracticeTopic[];
  sessions: PracticeSession[];
};
