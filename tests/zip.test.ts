import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { extractGameZip, ZipValidationError } from "@/lib/games/zip";

const html = strToU8("<!doctype html><title>x</title>");
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);

const extract = (files: Record<string, Uint8Array>) => extractGameZip(zipSync(files));
const paths = (files: Record<string, Uint8Array>) => extract(files).files.map((f) => f.path).sort();
const rejects = (files: Record<string, Uint8Array>, message: RegExp) => expect(() => extract(files)).toThrow(message);

describe("extractGameZip", () => {
  it("accepts a root game", () => {
    const game = extract({ "index.html": html, "a/b.png": png, "s.js": strToU8("1") });
    expect(game.entryPath).toBe("index.html");
    expect(game.files.map((f) => f.path).sort()).toEqual(["a/b.png", "index.html", "s.js"]);
    expect(game.skipped).toBe(0);
  });

  it("strips the single top folder and ignores macOS junk", () => {
    expect(paths({ "my-game/index.html": html, "my-game/s.css": strToU8("a{}"), "__MACOSX/x.js": strToU8("1") })).toEqual([
      "index.html",
      "s.css",
    ]);
  });

  it("silently leaves out repo, editor, docs and source files", () => {
    const game = extract({
      "proj/index.html": html,
      "proj/game.js": strToU8("1"),
      "proj/.gitignore": strToU8("node_modules"),
      "proj/.git/config": strToU8("x"),
      "proj/.vscode/settings.json": strToU8("{}"),
      "proj/README.md": strToU8("# hi"),
      "proj/docs/design.pdf": strToU8("%PDF"),
      "proj/src/main.ts": strToU8("1"),
      "proj/node_modules/lib/index.js": strToU8("1"),
      "proj/pnpm-lock.yaml": strToU8("x"),
    });
    expect(game.files.map((f) => f.path).sort()).toEqual(["game.js", "index.html"]);
    expect(game.skipped).toBe(8);
  });

  it("keeps 3D models, manifests and accented names", () => {
    expect(
      paths({
        "index.html": html,
        "models/herói.glb": strToU8("glTF"),
        "manifest.webmanifest": strToU8("{}"),
        "Música [tema].mp3": strToU8("ID3"),
      }),
    ).toEqual(["Música [tema].mp3", "index.html", "manifest.webmanifest", "models/herói.glb"]);
  });

  it("prefers the built game over a source folder with package.json", () => {
    const game = extract({
      "kombat/codigo-fonte/index.html": html,
      "kombat/codigo-fonte/package.json": strToU8("{}"),
      "kombat/codigo-fonte/src/app.ts": strToU8("1"),
      "kombat/jogo-offline/index.html": html,
      "kombat/jogo-offline/game.js": strToU8("1"),
    });
    expect(game.entryPath).toBe("index.html");
    expect(game.files.map((f) => f.path).sort()).toEqual(["game.js", "index.html"]);
  });

  it("picks the dist build inside a Vite project", () => {
    const game = extract({
      "app/index.html": html,
      "app/package.json": strToU8("{}"),
      "app/vite.config.ts": strToU8("1"),
      "app/dist/index.html": html,
      "app/dist/assets/a.js": strToU8("1"),
    });
    expect(game.files.map((f) => f.path).sort()).toEqual(["assets/a.js", "index.html"]);
  });

  it("picks the folder with more files when two entries are equally deep", () => {
    expect(paths({ "a/index.html": html, "b/index.html": html, "b/x.js": strToU8("1") })).toEqual(["index.html", "x.js"]);
  });

  it("uses a single html page when there is no index.html", () => {
    const game = extract({ "game.html": html, "s.js": strToU8("1") });
    expect(game.entryPath).toBe("game.html");
  });

  it("leaves out files outside the game folder", () => {
    expect(paths({ "game/index.html": html, "other.js": strToU8("1") })).toEqual(["index.html"]);
  });

  it("leaves out duplicates that differ only in case", () => {
    expect(paths({ "index.html": html, "A.js": strToU8("1"), "a.js": strToU8("2") })).toHaveLength(2);
  });

  it("leaves out dangerous paths instead of failing", () => {
    expect(
      paths({ "index.html": html, "../evil.js": strToU8("1"), "/etc/x.js": strToU8("1"), "..\\evil.js": strToU8("1") }),
    ).toEqual(["index.html"]);
  });

  it("leaves out executables and nested archives", () => {
    expect(
      paths({
        "index.html": html,
        "x.bin": new Uint8Array([0x4d, 0x5a, 0, 0]),
        "y.data": new Uint8Array([0x7f, 0x45, 0x4c, 0x46]),
        "z.data": zipSync({ "a.txt": strToU8("a") }),
        "run.exe": strToU8("x"),
      }),
    ).toEqual(["index.html"]);
  });

  it("rejects non-zip bytes", () => {
    expect(() => extractGameZip(strToU8("not a zip"))).toThrow(ZipValidationError);
  });

  it("explains what to do when there is no playable page", () =>
    rejects({ "next-app/package.json": strToU8("{}"), "next-app/app/page.js": strToU8("1") }, /built folder \(dist, build or out\)/));

  it("rejects too many game files", () => {
    const files: Record<string, Uint8Array> = { "index.html": html };
    for (let i = 0; i < 1001; i += 1) files[`f${i}.js`] = strToU8("1");
    rejects(files, /more than 1000/);
  });

  it("leaves out a single file over 50 MB", () => {
    expect(paths({ "index.html": html, "big.data": new Uint8Array(51 * 1024 * 1024) })).toEqual(["index.html"]);
  });

  it("does not inflate past a falsified declared size", () => {
    const archive = zipSync({ "index.html": html, "big.data": new Uint8Array(1024 * 1024).fill(7) }, { level: 9 });
    const view = new DataView(archive.buffer);
    for (let at = archive.length - 22; at > 0; at -= 1) {
      if (view.getUint32(at, true) === 0x02014b50 && new TextDecoder().decode(archive.subarray(at + 46, at + 46 + view.getUint16(at + 28, true))) === "big.data") {
        view.setUint32(at + 24, 10, true);
        break;
      }
    }
    let total = 0;
    try {
      total = extractGameZip(archive).totalBytes;
    } catch (error) {
      expect(error).toBeInstanceOf(ZipValidationError);
    }
    expect(total).toBeLessThan(1024);
  });
});
