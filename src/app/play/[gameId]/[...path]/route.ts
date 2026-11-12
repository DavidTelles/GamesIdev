import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL } from "@/lib/env";
import { contentTypeFor, validateGamePath } from "@/lib/games/file-rules";
import { HOSTED_GAME_CSP, injectStorageShim } from "@/lib/games/sandbox";
import { ZIP_LIMITS } from "@/lib/games/zip";
import { sql } from "@/lib/db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const BASE_HEADERS = {
  "Content-Security-Policy": HOSTED_GAME_CSP,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "Access-Control-Allow-Origin": "*",
};

function notFound() {
  return new NextResponse("Not found", { status: 404, headers: { ...BASE_HEADERS, "Content-Type": "text/plain" } });
}

function decodeSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export async function GET(_request: NextRequest, context: { params: Promise<{ gameId: string; path: string[] }> }) {
  const { gameId, path } = await context.params;
  const filePath = path.map(decodeSegment).join("/").normalize("NFC");
  if (!UUID.test(gameId) || validateGamePath(filePath, ZIP_LIMITS.depth)) return notFound();

  // Exact match first; otherwise fall back to a case-insensitive match (games built on Windows often mix case).
  const [file] = await sql`select f.storage_key, f.path from public.game_files f
    join public.games g on g.id = f.game_id
    where f.game_id = ${gameId} and g.source_type = 'zip' and g.status = 'published'
      and lower(f.path) = lower(${filePath})
    order by (f.path = ${filePath}) desc limit 1`;
  if (!file) return notFound();

  const key = (file.storage_key as string).split("/").map(encodeURIComponent).join("/");
  const upstream = await fetch(`${SUPABASE_URL}/storage/v1/object/public/game-files/${key}`);
  if (!upstream.ok || !upstream.body) return notFound();

  const contentType = contentTypeFor(file.path as string);
  const headers = { ...BASE_HEADERS, "Content-Type": contentType, "Cache-Control": "public, max-age=300" };
  if (contentType.startsWith("text/html")) {
    return new NextResponse(injectStorageShim(await upstream.text()), { headers });
  }
  return new NextResponse(upstream.body, { headers });
}
