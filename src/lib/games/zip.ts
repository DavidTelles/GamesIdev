import { unzipSync } from "fflate";
import { contentTypeFor, isAllowedContent, isGameAssetPath } from "./file-rules";

export const ZIP_LIMITS = {
  archiveBytes: 100 * 1024 * 1024,
  totalBytes: 250 * 1024 * 1024,
  fileBytes: 50 * 1024 * 1024,
  files: 1000,
  depth: 12,
} as const;

export class ZipValidationError extends Error {}

export type ExtractedFile = { path: string; contentType: string; data: Uint8Array };
export type ExtractedGame = { entryPath: string; files: ExtractedFile[]; totalBytes: number; skipped: number };

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const SOURCE_MARKER = /^(package\.json|vite\.config\.[cm]?[jt]s|next\.config\.[cm]?[jt]s|tsconfig\.json)$/i;

export const NO_ENTRY_MESSAGE =
  "No playable index.html was found. If this is a source project (Next.js, Vite, React), upload the built folder (dist, build or out) or publish it with an external URL.";

const dirOf = (path: string) => path.slice(0, path.lastIndexOf("/") + 1);
const baseOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

export function extractGameZip(archive: Uint8Array): ExtractedGame {
  if (archive.length > ZIP_LIMITS.archiveBytes) {
    throw new ZipValidationError("The ZIP file exceeds the 100 MB limit.");
  }
  if (!ZIP_MAGIC.every((byte, index) => archive[index] === byte)) {
    throw new ZipValidationError("The uploaded file is not a valid ZIP archive.");
  }

  const allNames: string[] = [];
  let declaredTotal = 0;
  let tooBig = false;

  let raw: Record<string, Uint8Array>;
  try {
    raw = unzipSync(archive, {
      filter: ({ name, originalSize }) => {
        if (name.endsWith("/")) return false;
        allNames.push(name);
        if (!isGameAssetPath(name, ZIP_LIMITS.depth) || originalSize > ZIP_LIMITS.fileBytes) return false;
        declaredTotal += originalSize;
        if (declaredTotal > ZIP_LIMITS.totalBytes) tooBig = true;
        return !tooBig;
      },
    });
  } catch {
    throw new ZipValidationError("The ZIP archive is corrupted or uses an unsupported format.");
  }
  if (tooBig) throw new ZipValidationError("The game is larger than 250 MB once extracted.");

  const kept = new Map<string, Uint8Array>();
  const seen = new Set<string>();
  for (const [name, data] of Object.entries(raw)) {
    const path = name.normalize("NFC");
    const key = path.toLowerCase();
    if (seen.has(key) || !isAllowedContent(data)) continue;
    seen.add(key);
    kept.set(path, data);
  }

  const sourceDirs = new Set(allNames.filter((name) => SOURCE_MARKER.test(baseOf(name))).map(dirOf));
  const entry = findEntry([...kept.keys()], sourceDirs);
  const prefix = dirOf(entry);

  const files: ExtractedFile[] = [];
  let totalBytes = 0;
  for (const [path, data] of kept) {
    if (!path.startsWith(prefix)) continue;
    totalBytes += data.length;
    files.push({ path: path.slice(prefix.length), contentType: contentTypeFor(path), data });
  }
  if (files.length > ZIP_LIMITS.files) {
    throw new ZipValidationError(`The game has more than ${ZIP_LIMITS.files} files.`);
  }

  return { entryPath: entry.slice(prefix.length), files, totalBytes, skipped: allNames.length - files.length };
}

function findEntry(paths: string[], sourceDirs: Set<string>): string {
  const depthOf = (path: string) => path.split("/").length;
  const filesUnder = (dir: string) => paths.filter((path) => path.startsWith(dir)).length;
  const pick = (candidates: string[]) => {
    const shallowest = Math.min(...candidates.map(depthOf));
    return candidates
      .filter((path) => depthOf(path) === shallowest)
      .sort((a, b) => filesUnder(dirOf(b)) - filesUnder(dirOf(a)))[0];
  };

  const indexes = paths.filter((path) => /^index\.html?$/i.test(baseOf(path)));
  const built = indexes.filter((path) => !sourceDirs.has(dirOf(path)));
  if (built.length) return pick(built);
  if (indexes.length) return pick(indexes);

  const pages = paths.filter((path) => /\.html?$/i.test(path));
  if (pages.length) {
    const shallowest = Math.min(...pages.map(depthOf));
    const top = pages.filter((path) => depthOf(path) === shallowest);
    if (top.length === 1) return top[0];
  }
  throw new ZipValidationError(NO_ENTRY_MESSAGE);
}
