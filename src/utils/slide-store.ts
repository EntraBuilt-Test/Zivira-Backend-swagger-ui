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
