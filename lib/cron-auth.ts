/**
 * Auth cho cron/admin endpoints: Vercel Cron tự gửi `Authorization: Bearer
 * $CRON_SECRET`; pinger ngoài (cron-job.org) dùng ?secret=.
 * Không set CRON_SECRET → local dev mở.
 */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  return new URL(req.url).searchParams.get("secret") === secret;
}

export function cronForbidden(): Response {
  return Response.json({ error: "forbidden" }, { status: 403 });
}
