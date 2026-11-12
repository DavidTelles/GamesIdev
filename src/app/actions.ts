"use server";

import { z } from "zod";
import { getViewerRating, rateGame, recordPlayStart, recordView } from "@/services/games";

const isGameId = (value: unknown) => z.uuid().safeParse(value).success;
const isViewerKey = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9-]{16,64}$/.test(value);

export async function countView(gameId: string, viewerKey: string) {
  if (!isGameId(gameId) || !isViewerKey(viewerKey)) return;
  await recordView(gameId, viewerKey).catch(() => undefined);
}

export async function rate(gameId: string, viewerKey: string, score: number) {
  if (!isGameId(gameId) || !isViewerKey(viewerKey) || !Number.isInteger(score) || score < 1 || score > 5) {
    return { ok: false as const, error: "Invalid rating." };
  }
  try {
    const stats = await rateGame(gameId, viewerKey, score);
    return stats ? { ok: true as const, ...stats } : { ok: false as const, error: "Game not found." };
  } catch {
    return { ok: false as const, error: "Could not save your rating." };
  }
}

export async function getMyRating(gameId: string, viewerKey: string) {
  if (!isGameId(gameId) || !isViewerKey(viewerKey)) return null;
  return getViewerRating(gameId, viewerKey).catch(() => null);
}

export async function trackPlayStart(gameId: string) {
  if (!isGameId(gameId)) return;
  await recordPlayStart(gameId).catch(() => undefined);
}
