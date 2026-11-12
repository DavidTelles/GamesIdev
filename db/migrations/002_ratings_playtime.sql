-- Anonymous ratings (one per browser viewer key) and play-time tracking.

alter table public.games
  add column rating_count integer not null default 0,
  add column rating_sum integer not null default 0,
  add column rating_avg numeric(3, 2) not null default 0,
  add column play_seconds bigint not null default 0,
  add column play_sessions integer not null default 0;

create index games_rated_idx on public.games (((rating_sum + 9)::numeric / (rating_count + 3)) desc, created_at desc)
  where status = 'published';
create index games_played_idx on public.games (play_seconds desc, created_at desc) where status = 'published';
create index games_sessions_idx on public.games (play_sessions desc, created_at desc) where status = 'published';

create table public.ratings (
  game_id uuid not null references public.games (id) on delete cascade,
  viewer_key text not null,
  score smallint not null check (score between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (game_id, viewer_key),
  constraint ratings_viewer_key check (viewer_key ~ '^[A-Za-z0-9-]{16,64}$')
);

create trigger ratings_updated_at before update on public.ratings
  for each row execute function public.set_updated_at();

create function public.bump_rating_stats() returns trigger
language plpgsql set search_path = '' as $$
declare
  target uuid := coalesce(new.game_id, old.game_id);
begin
  update public.games g
  set rating_count = s.total,
      rating_sum = s.points,
      rating_avg = case when s.total = 0 then 0 else round(s.points::numeric / s.total, 2) end
  from (
    select count(*)::int as total, coalesce(sum(score), 0)::int as points
    from public.ratings where game_id = target
  ) s
  where g.id = target;
  return null;
end;
$$;
create trigger ratings_stats after insert or update or delete on public.ratings
  for each row execute function public.bump_rating_stats();

create function public.record_play_time(p_game_id uuid, p_seconds integer) returns void
language sql set search_path = '' as $$
  update public.games
  set play_seconds = play_seconds + least(greatest(p_seconds, 0), 60)
  where id = p_game_id and status = 'published';
$$;

create function public.record_play_start(p_game_id uuid) returns void
language sql set search_path = '' as $$
  update public.games set play_sessions = play_sessions + 1 where id = p_game_id and status = 'published';
$$;
