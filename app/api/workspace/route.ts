import { NextResponse } from "next/server";
import { deleteRecord, endDay, getUserWorkspace, publicWorkspace, requireUser, saveActiveDay, startDay, submitAnswer } from "@/backend/workspace";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workspace = await getUserWorkspace(user.id);
  return workspace ? NextResponse.json(publicWorkspace(workspace), { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "Workspace not found." }, { status: 404 });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  try {
    let updated;
    if (body?.action === "start") updated = await startDay(user.id, body as never);
    else if (body?.action === "answer" && typeof body.answer === "string") updated = await submitAnswer(user.id, body.answer.slice(0, 500));
    else if (body?.action === "end") updated = await endDay(user.id);
    else if (body?.action === "delete-record" && typeof body.recordId === "string") updated = await deleteRecord(user.id, body.recordId);
    else return NextResponse.json({ error: "Invalid action." }, { status: 400 });
    return updated ? NextResponse.json(publicWorkspace(updated)) : NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update workspace." }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid workspace update." }, { status: 400 });
  const updated = await saveActiveDay(user.id, body as never);
  return updated ? NextResponse.json(publicWorkspace(updated)) : NextResponse.json({ error: "Workspace not found." }, { status: 404 });
}

