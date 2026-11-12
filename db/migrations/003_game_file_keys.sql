-- Supabase Storage only accepts ASCII object names, so hosted files are stored under a generated key
-- while game_files.path keeps the original (possibly accented) path the game requests.

alter table public.game_files add column storage_key text;
update public.game_files set storage_key = game_id::text || '/' || path where storage_key is null;
alter table public.game_files alter column storage_key set not null;
create index game_files_path_ci_idx on public.game_files (game_id, lower(path));
