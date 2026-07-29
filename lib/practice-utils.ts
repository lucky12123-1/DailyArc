import { type PracticeState, type PracticeTopic, type PracticeSession } from "./types";

export function emptyPractice(): PracticeState {
  return { topics: [], sessions: [] };
}

export function practiceStateFromJSON(value: unknown): PracticeState {
  if (!value || typeof value !== "object") return emptyPractice();
  const raw = value as Partial<PracticeState>;
  const topics = Array.isArray(raw.topics) ? raw.topics.filter(isPracticeTopic) : [];
  const sessions = Array.isArray(raw.sessions) ? raw.sessions.filter(isPracticeSession) : [];
  return { topics, sessions };
}

function isPracticeTopic(value: unknown): value is PracticeTopic {
  return typeof value === "object" && value !== null && "id" in value && "title" in value && "createdAt" in value;
}

function isPracticeSession(value: unknown): value is PracticeSession {
  return typeof value === "object" && value !== null && "id" in value && "topicId" in value && "minutes" in value;
}
