import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { compactNumber, formatDuration } from "@/lib/format";
import { listGames } from "@/services/games";
import type { FeedSort, GameCard } from "@/types";

export const metadata: Metadata = { title: "Top games" };
export const revalidate = 60;

const RANK_SIZE = 50;

type Ranking = {
  by: string;
  sort: FeedSort;
  label: string;
  heading: string;
  metric: (game: GameCard) => string;
  empty: string;
};

const RANKINGS: Ranking[] = [
  {
    by: "rated",
    sort: "rated",
    label: "Top rated",
    heading: "Highest rated games",
    metric: (game) => `★ ${game.rating_avg.toFixed(1)} · ${game.rating_count} ${game.rating_count === 1 ? "rating" : "ratings"}`,
    empty: "No games have been rated yet. Open a game and click the stars to rate it.",
  },
  {
    by: "views",
    sort: "popular",
    label: "Most viewed",
    heading: "Most viewed games",
    metric: (game) => `${compactNumber(game.view_count)} views`,
    empty: "No views recorded yet.",
  },
  {
    by: "played",
    sort: "played",
    label: "Most time played",
    heading: "Games with the most time played",
    metric: (game) => `${formatDuration(game.play_seconds)} played`,
    empty: "No play time recorded yet.",
  },
  {
    by: "plays",
    sort: "sessions",
    label: "Most plays",
    heading: "Games started the most",
    metric: (game) => `${compactNumber(game.play_sessions)} plays`,
    empty: "No plays recorded yet.",
  },
];

const MEDALS = ["bg-sun", "bg-[#d9d9e3]", "bg-[#e3a46b]"];

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function TopPage({ searchParams }: { searchParams: SearchParams }) {
  const { by } = await searchParams;
  const ranking = RANKINGS.find((item) => item.by === by) ?? RANKINGS[0];
  const games = await listGames({ sort: ranking.sort, rankedOnly: true, limit: RANK_SIZE });

  return (
    <>
      <h1 className="font-display text-3xl font-extrabold">Top games</h1>
      <nav aria-label="Rankings" className="mt-4 flex flex-wrap gap-2">
        {RANKINGS.map((item) => (
          <Link
            key={item.by}
            href={`/top?by=${item.by}`}
            aria-current={item.by === ranking.by ? "page" : undefined}
            className={`btn ${item.by === ranking.by ? "btn-primary" : ""}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <h2 className="mb-4 mt-8 font-display text-xl font-bold">{ranking.heading}</h2>
      {games.length === 0 ? (
        <p className="tile p-8 text-center text-muted">{ranking.empty}</p>
      ) : (
        <ol className="space-y-3">
          {games.map((game, index) => (
            <li key={game.id}>
              <Link href={`/games/${game.slug}`} className="tile game-card flex items-center gap-3 p-2 pr-4 sm:gap-4">
                <span
                  aria-label={`Rank ${index + 1}`}
                  className={`grid size-10 shrink-0 place-items-center rounded-full border-2 border-line font-display text-lg font-extrabold ${MEDALS[index] ?? "bg-card"}`}
                >
                  {index + 1}
                </span>
                <span className="relative aspect-[4/3] w-20 shrink-0 overflow-hidden rounded-lg border-2 border-line sm:w-28">
                  <Image src={game.cover_url} alt="" fill sizes="7rem" className="object-cover" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display font-bold">{game.title}</span>
                  <span className="block truncate text-xs text-muted">
                    {game.category?.name} · {game.developer_name}
                  </span>
                </span>
                <span className="shrink-0 text-right text-sm font-bold">{ranking.metric(game)}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
