// Round 59 -- file storage for E-Detailing slides. Slide files used to be base64 strings inside their metadata documents (one copy per brand).
// They now live in MongoDB GridFS (bucket "slideFiles"): ONE stored file per uploaded slide, referenced by every brand row through `fileRef`.
// Rows written before this round keep their base64 `fileData` and are still read (readSlideBuffer handles both).
// The store is swappable (setSlideStore) so tests can run without a database.
import mongoose from "mongoose";
import { getMasterModel } from "../models/master-record.model.js";

export interface SlideStore {
  put(buf: Buffer, meta: { fileName: string; mimeType: string; tenantSlug: string }): Promise<string>;
  read(id: string): Promise<Buffer>;
  remove(id: string): Promise<void>;
}

const gridfs = (): SlideStore => {
  const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db!, { bucketName: "slideFiles" });
  return {
    put: (buf, meta) => new Promise((resolve, reject) => {
      const up = bucket().openUploadStream(meta.fileName, { metadata: { tenantSlug: meta.tenantSlug, mimeType: meta.mimeType } });
      up.on("error", reject); up.on("finish", () => resolve(String(up.id)));
      up.end(buf);
    }),
    read: (id) => new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const s = bucket().openDownloadStream(new mongoose.Types.ObjectId(id));
      s.on("data", (c: Buffer) => chunks.push(c)); s.on("error", reject); s.on("end", () => resolve(Buffer.concat(chunks)));
    }),
    remove: async (id) => { await bucket().delete(new mongoose.Types.ObjectId(id)); }
  };
};

let store: SlideStore | null = null;
export const getSlideStore = (): SlideStore => (store ||= gridfs());
export const setSlideStore = (s: SlideStore | null) => { store = s; };

/** The bytes of a slide row, wherever they live (GridFS via fileRef, or legacy base64 fileData). */
export async function readSlideBuffer(row: any): Promise<Buffer | null> {
  if (row?.fileRef) { try { return await getSlideStore().read(String(row.fileRef)); } catch { return null; } }
  if (row?.fileData) return Buffer.from(String(row.fileData), "base64");
  return null;
}
export const hasSlideFile = { $or: [{ fileRef: { $exists: true } }, { fileData: { $exists: true } }] };

/** Remove a stored file once no slide row references it any more. */
export async function releaseSlideFile(tenantSlug: string, fileRef: unknown): Promise<boolean> {
  if (!fileRef) return false;
  const still = await getMasterModel("slideUploadEDetailing").countDocuments({ tenantSlug, fileRef: String(fileRef) });
  if (still > 0) return false;
  try { await getSlideStore().remove(String(fileRef)); return true; } catch { return false; }
}

// ── Round 60: move the old base64 slides into GridFS ────────────────────────────────────────────
// Rows written before Round 59 hold the whole file as base64 `fileData` (one copy per brand). Migration: group those rows by (file name + content hash),
// store each distinct file ONCE in the slide store, point every row of the group at it (`fileRef`), then drop the base64 from the row.
// Idempotent and safe to re-run: rows that already have a fileRef are never touched; a row keeps its base64 (and keeps being served) until its own
// update succeeded; a stored file whose rows could not be updated is removed again, so a failed run leaves no orphan.
import { createHash } from "node:crypto";

export type SlideMigrationResult = { legacyBefore: number; rowsMigrated: number; filesStored: number; rowsFailed: number; legacyAfter: number; bytesFreed: number };
const running = new Map<string, Promise<SlideMigrationResult>>();
const done = new Set<string>();

export async function countLegacySlides(tenantSlug: string): Promise<number> {
  return getMasterModel("slideUploadEDetailing").countDocuments({ tenantSlug, fileData: { $exists: true }, fileRef: { $exists: false } });
}

export function migrateLegacySlides(tenantSlug: string): Promise<SlideMigrationResult> {
  const inflight = running.get(tenantSlug);
  if (inflight) return inflight;
  const p = (async (): Promise<SlideMigrationResult> => {
    const Slides = getMasterModel("slideUploadEDetailing");
    const ids = ((await Slides.find({ tenantSlug, fileData: { $exists: true }, fileRef: { $exists: false } }).select("_id").lean()) as any[]).map((r) => r._id);
    const out: SlideMigrationResult = { legacyBefore: ids.length, rowsMigrated: 0, filesStored: 0, rowsFailed: 0, legacyAfter: 0, bytesFreed: 0 };
    const stored = new Map<string, { ref: string; size: number }>();            // group key -> stored file
    const rowsOfRef = new Map<string, number>();
    for (const id of ids) {                                                      // one row at a time: never hold the whole library in memory
      const row = (await Slides.findOne({ _id: id }).lean()) as any;
      if (!row || row.fileRef || !row.fileData) continue;                       // migrated meanwhile / nothing to move
      const buf = Buffer.from(String(row.fileData), "base64");
      const key = `${row.fileName}|${createHash("sha256").update(buf).digest("hex")}`;
      let hit = stored.get(key);
      let created = false;
      try {
        if (!hit) { hit = { ref: await getSlideStore().put(buf, { fileName: String(row.fileName ?? "slide"), mimeType: String(row.mimeType || "application/octet-stream"), tenantSlug }), size: buf.length }; stored.set(key, hit); created = true; out.filesStored++; }
        await Slides.updateOne({ _id: id }, { $set: { fileRef: hit.ref, fileSize: hit.size }, $unset: { fileData: "" } });
        rowsOfRef.set(hit.ref, (rowsOfRef.get(hit.ref) || 0) + 1);
        out.rowsMigrated++; out.bytesFreed += String(row.fileData).length;
      } catch {
        out.rowsFailed++;
        if (created && hit && !rowsOfRef.get(hit.ref)) { stored.delete(key); out.filesStored--; try { await getSlideStore().remove(hit.ref); } catch { /* best effort */ } }
      }
    }
    out.legacyAfter = await countLegacySlides(tenantSlug);
    if (out.legacyAfter === 0) done.add(tenantSlug);
    return out;
  })().finally(() => running.delete(tenantSlug));
  running.set(tenantSlug, p);
  return p;
}

/** First access of the slide screens: migrate once per process per tenant; never blocks or fails the request. */
export async function ensureSlidesMigrated(tenantSlug: string): Promise<void> {
  if (done.has(tenantSlug)) return;
  try { await migrateLegacySlides(tenantSlug); } catch { /* old rows keep being served */ }
  done.add(tenantSlug);
}
export const resetSlideMigrationState = () => { done.clear(); running.clear(); };
