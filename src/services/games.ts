import "server-only";
import { sql } from "@/lib/db";
import type { Category, FeedSort, GameCard, GameDetail } from "@/types";

const CARD_COLUMNS = `g.id, g.slug, g.title, g.cover_url, g.developer_name, g.view_count::float8 as view_count,
  g.rating_avg::float8 as rating_avg, g.rating_count, g.play_seconds::float8 as play_seconds, g.play_sessions,
  to_json(g.created_at) #>> '{}' as created_at, json_build_object('slug', c.slug, 'name', c.name) as category`;
const CARD_FROM = "from public.games g join public.categories c on c.id = g.category_id";

// Bayesian average: three phantom 3-star votes keep a single 5-star vote from topping the ranking.
const SORT_COLUMN: Record<FeedSort, string> = {
  popular: "g.view_count",
  recent: "g.created_at",
  rated: "((g.rating_sum + 9)::numeric / (g.rating_count + 3))",
  played: "g.play_seconds",
  sessions: "g.play_sessions",
};

const SORT_FILTER: Partial<Record<FeedSort, string>> = {
  rated: "g.rating_count > 0",
  played: "g.play_seconds > 0",
  sessions: "g.play_sessions > 0",
};

export const PAGE_SIZE = 24;

function escapeLike(term: string) {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function listCategories(): Promise<Category[]> {
  return (await sql`select id, slug, name from public.categories order by position`) as Category[];
}

type FeedOptions = {
  sort?: FeedSort;
  categoryId?: number;
  search?: string;
  featured?: boolean;
  rankedOnly?: boolean;
  offset?: number;
  limit?: number;
};

export async function listGames(options: FeedOptions = {}): Promise<GameCard[]> {
  const { sort = "recent", search, featured, rankedOnly, categoryId, offset = 0, limit = PAGE_SIZE } = options;
  const params: unknown[] = [];
  const where = ["g.status = 'published'"];
  if (rankedOnly && SORT_FILTER[sort]) where.push(SORT_FILTER[sort]);
  const bind = (value: unknown) => `$${params.push(value)}`;
  if (categoryId) where.push(`g.category_id = ${bind(categoryId)}`);
  if (featured) where.push("g.is_featured");
  if (search) where.push(`g.title ilike ${bind(`%${escapeLike(search)}%`)}`);
  const query = `select ${CARD_COLUMNS} ${CARD_FROM} where ${where.join(" and ")}
    order by ${SORT_COLUMN[sort]} desc, g.created_at desc limit ${bind(limit)} offset ${bind(offset)}`;
  return (await sql.query(query, params)) as GameCard[];
}

export async function getGameBySlug(slug: string): Promise<GameDetail | null> {
  const query = `select ${CARD_COLUMNS}, g.category_id, g.description, g.controls, g.technologies,
      g.source_type, g.entry_path, g.external_url, g.embed_status
    ${CARD_FROM} where g.slug = $1 and g.status = 'published'`;
  const [game] = await sql.query(query, [slug]);
  return (game as GameDetail | undefined) ?? null;
}

export async function recordView(gameId: string, viewerKey: string) {
  await sql`select public.record_game_view(${gameId}, ${viewerKey})`;
}

async function isPublished(gameId: string) {
  return (await sql`select 1 from public.games where id = ${gameId} and status = 'published'`).length > 0;
}

export async function rateGame(gameId: string, viewerKey: string, score: number) {
  if (!(await isPublished(gameId))) return null;
  await sql`insert into public.ratings (game_id, viewer_key, score) values (${gameId}, ${viewerKey}, ${score})
    on conflict (game_id, viewer_key) do update set score = excluded.score`;
  const [stats] = await sql`select rating_avg::float8 as rating_avg, rating_count from public.games where id = ${gameId}`;
  return stats as { rating_avg: number; rating_count: number };
}

export async function getViewerRating(gameId: string, viewerKey: string): Promise<number | null> {
  const [row] = await sql`select score from public.ratings where game_id = ${gameId} and viewer_key = ${viewerKey}`;
  return (row?.score as number | undefined) ?? null;
}

export async function recordPlayTime(gameId: string, seconds: number) {
  await sql`select public.record_play_time(${gameId}, ${seconds})`;
}

export async function recordPlayStart(gameId: string) {
  await sql`select public.record_play_start(${gameId})`;
}
