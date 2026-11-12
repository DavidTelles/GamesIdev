"use client";

import { startTransition, useEffect, useState } from "react";
import { getMyRating, rate } from "@/app/actions";
import { getViewerKey } from "@/lib/viewer";

type Props = { gameId: string; average: number; count: number };

export function RatingStars({ gameId, average, count }: Props) {
  const [score, setScore] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [stats, setStats] = useState({ average, count });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const key = getViewerKey();
    startTransition(async () => setScore(await getMyRating(gameId, key)));
  }, [gameId]);

  const choose = async (value: number) => {
    setSaving(true);
    const result = await rate(gameId, getViewerKey(), value);
    setSaving(false);
    if (!result.ok) return setError(result.error);
    setError(null);
    setScore(value);
    setStats({ average: result.rating_avg, count: result.rating_count });
  };

  const shown = hover ?? score ?? 0;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Rate this game" className="flex items-center" onMouseLeave={() => setHover(null)}>
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              disabled={saving}
              aria-label={`Rate ${value} of 5`}
              aria-pressed={score === value}
              className={`grid size-9 place-items-center text-3xl leading-none transition-colors ${value <= shown ? "text-brand" : "text-muted/40"} hover:text-brand disabled:opacity-60`}
              onMouseEnter={() => setHover(value)}
              onFocus={() => setHover(value)}
              onBlur={() => setHover(null)}
              onClick={() => choose(value)}
            >
              ★
            </button>
          ))}
        </div>
        <span className="text-sm font-semibold">
          {stats.count ? `${stats.average.toFixed(1)} · ${stats.count} ${stats.count === 1 ? "rating" : "ratings"}` : "No ratings yet"}
        </span>
      </div>
      <p role="status" className="mt-1 text-xs text-muted">
        {score ? `Your rating: ${score} of 5. Click a star to change it.` : "Click a star to rate this game."}
      </p>
      {error && <p role="alert" className="mt-1 text-sm font-semibold text-brand-dark">{error}</p>}
    </div>
  );
}
