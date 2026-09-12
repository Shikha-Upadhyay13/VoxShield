# Keep free-tier Render warm during demo week.
# Option A: UptimeRobot HTTP(s) monitor → GET https://YOUR-API.onrender.com/health every 5–10 min
# Option B: Vercel Cron (Hobby) hitting a thin Next.js route that proxies /health
#
# This file documents the keep-alive contract; no secrets required.

path: /api/keep-alive
schedule: "*/10 * * * *"
target: NEXT_PUBLIC_VOXSHIELD_API/health
