export type Category = { id: number; slug: string; name: string };

export type GameCard = {
  id: string;
  slug: string;
  title: string;
  cover_url: string;
  developer_name: string;
  view_count: number;
  rating_avg: number;
  rating_count: number;
  play_seconds: number;
  play_sessions: number;
  created_at: string;
  category: { slug: string; name: string } | null;
};

export type GameDetail = GameCard & {
  category_id: number;
  description: string;
  controls: string;
  technologies: string[];
  source_type: "zip" | "url";
  entry_path: string | null;
  external_url: string | null;
  embed_status: "embeddable" | "blocked";
};

export type FeedSort = "popular" | "recent" | "rated" | "played" | "sessions";
