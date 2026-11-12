import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { beforeAll, describe, expect, it } from "vitest";

const GAME = "00000000-0000-4000-8000-0000000000aa";
const HIDDEN = "00000000-0000-4000-8000-0000000000bb";

let db: PGlite;
const query = (sql: string) => db.query<Record<string, unknown>>(sql);
const count = async (sql: string) => Number((await query(sql)).rows[0].n);

beforeAll(async () => {
  db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(readFileSync("db/schema.sql", "utf8"));
  await db.exec(`
    insert into public.games (id, category_id, slug, title, description, developer_name, controls, cover_url, source_type, entry_path, status, publisher_key)
    values ('${GAME}', 1, 'open-game', 'Open', 'A description.', 'Alice', 'keys', 'https://x.co/c.png', 'zip', 'index.html', 'published', 'k'),
           ('${HIDDEN}', 1, 'hidden-game', 'Hidden', 'A description.', 'Alice', 'keys', 'https://x.co/c.png', 'zip', 'index.html', 'hidden', 'k');
  `);
});

describe("games", () => {
  it("rejects a javascript: external URL", async () => {
    await expect(
      query(`insert into public.games (category_id, slug, title, description, developer_name, controls, cover_url, source_type, external_url, publisher_key)
             values (1, 'js-x', 'XX', 'A description.', 'AA', 'keys', 'https://x.co', 'url', 'javascript:alert(1)', 'k')`),
    ).rejects.toThrow(/games_source_shape/);
  });
  it("requires a publisher key", async () => {
    await expect(
      query(`insert into public.games (category_id, slug, title, description, developer_name, controls, cover_url, source_type, external_url)
             values (1, 'no-key', 'XX', 'A description.', 'AA', 'keys', 'https://x.co', 'url', 'https://x.co')`),
    ).rejects.toThrow(/publisher_key/);
  });
});

describe("ratings", () => {
  const A = "viewer-key-aaaaaaaaaa";
  const B = "viewer-key-bbbbbbbbbb";
  const stats = async () =>
    (await query(`select rating_count, rating_sum, rating_avg::float8 avg from public.games where id='${GAME}'`)).rows[0];

  it("averages one rating per viewer and recalculates when a viewer changes it", async () => {
    await query(`insert into public.ratings (game_id, viewer_key, score) values ('${GAME}','${A}',5), ('${GAME}','${B}',2)`);
    expect(await stats()).toEqual({ rating_count: 2, rating_sum: 7, avg: 3.5 });
    await query(`insert into public.ratings (game_id, viewer_key, score) values ('${GAME}','${A}',3)
      on conflict (game_id, viewer_key) do update set score = excluded.score`);
    expect(await stats()).toEqual({ rating_count: 2, rating_sum: 5, avg: 2.5 });
    await query(`delete from public.ratings where viewer_key='${B}'`);
    expect(await stats()).toEqual({ rating_count: 1, rating_sum: 3, avg: 3 });
  });
  it("rejects out-of-range scores and malformed viewer keys", async () => {
    await expect(query(`insert into public.ratings (game_id, viewer_key, score) values ('${GAME}','${B}',6)`)).rejects.toThrow(/check/);
    await expect(query(`insert into public.ratings (game_id, viewer_key, score) values ('${GAME}','bad key',4)`)).rejects.toThrow(/ratings_viewer_key/);
  });
});

describe("play time", () => {
  it("caps each report at 60 seconds and ignores hidden games", async () => {
    await query(`select public.record_play_time('${GAME}', 45)`);
    await query(`select public.record_play_time('${GAME}', 5000)`);
    await query(`select public.record_play_time('${GAME}', -10)`);
    expect(await count(`select play_seconds n from public.games where id='${GAME}'`)).toBe(105);
    await query(`select public.record_play_time('${HIDDEN}', 30)`);
    expect(await count(`select play_seconds n from public.games where id='${HIDDEN}'`)).toBe(0);
  });
  it("counts play sessions for published games only", async () => {
    await query(`select public.record_play_start('${GAME}')`);
    await query(`select public.record_play_start('${HIDDEN}')`);
    expect(await count(`select play_sessions n from public.games where id='${GAME}'`)).toBe(1);
    expect(await count(`select play_sessions n from public.games where id='${HIDDEN}'`)).toBe(0);
  });
});

describe("views", () => {
  it("counts a viewer once per day and ignores hidden games", async () => {
    const key = "viewer-key-0000000001";
    await query(`select public.record_game_view('${GAME}','${key}')`);
    await query(`select public.record_game_view('${GAME}','${key}')`);
    expect(await count(`select view_count n from public.games where id='${GAME}'`)).toBe(1);
    await query(`select public.record_game_view('${HIDDEN}','${key}')`);
    expect(await count(`select view_count n from public.games where id='${HIDDEN}'`)).toBe(0);
  });
});
