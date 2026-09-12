import { NextResponse } from "next/server";

/**
 * Thin keep-alive proxy for free-tier Render.
 * Point a cron (Vercel Cron or UptimeRobot) at /api/keep-alive every ~10 minutes.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const base = (process.env.NEXT_PUBLIC_VOXSHIELD_API || "http://127.0.0.1:8000").replace(
    /\/$/,
    "",
  );
  try {
    const response = await fetch(`${base}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    const body = await response.json().catch(() => ({}));
    return NextResponse.json(
      { ok: response.ok, upstream: base, health: body },
      { status: response.ok ? 200 : 502 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "upstream unreachable";
    return NextResponse.json({ ok: false, upstream: base, error: message }, { status: 502 });
  }
}
