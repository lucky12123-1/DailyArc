import { NextResponse } from "next/server";
import { createUser, getUserByName } from "@/backend/repository";
import { createSession, hashPassword, verifyPassword } from "@/backend/security";

const cookieOptions = { httpOnly: true, sameSite: "strict" as const, secure: process.env.NODE_ENV === "production", path: "/" };
export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (action === "logout") { const response = NextResponse.json({ ok: true }); response.cookies.set("dailyarc_session", "", { ...cookieOptions, maxAge: 0 }); return response; }
  const body = await request.json().catch(() => null) as { name?: unknown; password?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : ""; const password = typeof body?.password === "string" ? body.password : "";
  if (!name || name.length > 80 || password.length < 12 || password.length > 128) return NextResponse.json({ error: "Use a display name and a password between 12 and 128 characters." }, { status: 400 });
  try {
    if (action !== "register" && action !== "login") return NextResponse.json({ error: "Unknown action." }, { status: 404 });
    const user = action === "register" ? await createUser(name, await hashPassword(password)) : await getUserByName(name);
    if (!user || (action === "login" && !user.passwordHash)) return NextResponse.json({ error: "Invalid display name or password." }, { status: 401 });
    if (action === "login" && !(await verifyPassword(password, user.passwordHash!))) return NextResponse.json({ error: "Invalid display name or password." }, { status: 401 });
    const session = createSession(user.id); const response = NextResponse.json({ user: { id: user.id, name: user.name } }); response.cookies.set("dailyarc_session", session.value, { ...cookieOptions, maxAge: session.maxAge }); return response;
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to authenticate." }, { status: 400 }); }
}
