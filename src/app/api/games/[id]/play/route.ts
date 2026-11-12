import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSameOrigin } from "@/lib/http";
import { recordPlayTime } from "@/services/games";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const seconds = Number(body?.seconds);
  if (isSameOrigin(request) && z.uuid().safeParse(id).success && Number.isInteger(seconds) && seconds > 0) {
    await recordPlayTime(id, Math.min(seconds, 60)).catch(() => undefined);
  }
  return new NextResponse(null, { status: 204 });
}
