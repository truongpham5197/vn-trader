import { webhookCallback } from "grammy";
import { createBot } from "@/lib/telegram/bot";

export const dynamic = "force-dynamic";

let handler: ((req: Request) => Promise<Response>) | null = null;

/** Telegram webhook — production mode trên Vercel (polling chỉ dùng local). */
export async function POST(req: Request): Promise<Response> {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expected && req.headers.get("x-telegram-bot-api-secret-token") !== expected) {
    return new Response("forbidden", { status: 403 });
  }
  if (!handler) handler = webhookCallback(createBot(), "std/http");
  return handler(req);
}
