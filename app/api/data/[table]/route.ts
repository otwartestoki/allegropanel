import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ table: string }> }) {
  const username = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;
  if (!username || !password || request.headers.get("authorization") !==
      "Basic " + Buffer.from(username + ":" + password).toString("base64")) {
    return new Response(null, { status: 401 });
  }
  const { table } = await context.params;
  if (!["allegro_orders", "allegro_billing_entries", "allegro_sync_state"].includes(table)) {
    return new Response(null, { status: 404 });
  }
  const base = process.env.ALLEGRO_DATA_URL;
  const token = process.env.ALLEGRO_DATA_TOKEN;
  if (!base || !token) return new Response(null, { status: 503 });
  try {
    const target = new URL(base.replace(/\/$/, "") + "/" + table);
    target.search = request.nextUrl.search;
    const upstream = await fetch(target, {
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json({ message: "Baza DigitalOcean jest chwilowo niedostępna." }, { status: 502 });
  }
}
