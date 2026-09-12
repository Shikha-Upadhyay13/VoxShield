# Keep free-tier Render warm during demo week.
#
# Memory (from deploy survey):
# - free ~512 MB → use VOXSHIELD_PROFILE=mobile only (SilverGuard + whisper-tiny).
# - lite (~450 MB weights + Torch) needs ≥1–2 GB always-on (Render Starter+).
# - full profile is laptop / large instance only.
#
# Warmth (free spins down and kills WebSockets):
# Option A: UptimeRobot → GET https://YOUR-API.onrender.com/health every 5–10 min
# Option B: Vercel Cron → /api/keep-alive (see vercel.json)
#
# CORS: set ALLOWED_ORIGINS on the API to your Vercel URL (comma-separated).

path: /api/keep-alive
schedule: "*/10 * * * *"
target: NEXT_PUBLIC_VOXSHIELD_API/health
