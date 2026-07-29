"use client";

export async function apiRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(path, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin", signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Request failed.");
    return payload as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("The server took too long to respond. Please try again.");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
