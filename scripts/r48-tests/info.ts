// Round 48 Part D in-memory verification (no MongoDB). Run: npm i --no-save sift && npx tsx scripts/r44-tests/compute.ts
import mongoose from "mongoose";
import sift from "sift";

// ── Tiny in-memory stand-in for Mongo: patches Model query statics so the
// REAL compute code (mis-reports-compute.ts + helpers) runs unmodified over
// seeded documents. sift evaluates the real Mongo filter operators.
const store: Record<string, any[]> = {};
const asId = (n: number) => new mongoose.Types.ObjectId(String(n).padStart(24, "0"));
class Q {
  constructor(private docs: any[], private model: any) {}
  select() { return this; }
  sort(spec: any) { const [k, dir] = Object.entries(spec)[0] as [string, number]; this.docs = [...this.docs].sort((a, b) => (a[k] > b[k] ? 1 : -1) * (dir < 0 ? -1 : 1)); return this; }
  populate(path: string) {
    const doctors = store["doctors"] || [];
    this.docs = this.docs.map((d) => ({ ...d, [path]: doctors.find((x) => String(x._id) === String(d[path])) || d[path] }));
    return this;
  }
  lean() { return this; }
  then(res: any, rej: any) { return Promise.resolve(JSON.parse(JSON.stringify(this.docs), (k, v) => v)).then((x) => x.map((d: any, i: number) => ({ ...this.docs[i], ...d, _id: this.docs[i]._id }))).then(res, rej); }
}
const coll = (m: any) => store[m.collection.name] || (store[m.collection.name] = []);
(mongoose.Model as any).find = function (f: any = {}) { return new Q(coll(this).filter(sift(f)), this); };
(mongoose.Model as any).findOne = function (f: any = {}) { const q = new Q(coll(this).filter(sift(f)), this); const t = q.then.bind(q); (q as any).then = (res: any, rej: any) => t((arr: any[]) => arr[0] || null).then(res, rej); const s = q.sort.bind(q); (q as any).sort = (x: any) => { s(x); return q; }; return q; };
(mongoose.Model as any).countDocuments = function (f: any = {}) { return Promise.resolve(coll(this).filter(sift(f)).length); };
(mongoose.Model as any).aggregate = function (pipe: any[]) {
  const match = pipe[0].$match; const docs = coll(this).filter(sift(match)); const g = pipe[1].$group; const out = new Map<string, any>();
  for (const d of docs) { const id = d.employeeCode; const cur = out.get(id); const v = d.visitDateOnly; if (!cur || v > cur.last) out.set(id, { _id: id, last: v }); }
  return Promise.resolve(Array.from(out.values()));
};
let seq = 9000;
(mongoose.Model as any).create = function (arg: any) { const arr = Array.isArray(arg) ? arg : [arg]; const made = arr.map((d: any) => { const doc = { ...new (this as any)(d).toObject(), _id: asId(seq++), createdAt: new Date(), updatedAt: new Date() }; coll(this).push(doc); return doc; }); return Promise.resolve(Array.isArray(arg) ? made : made[0]); };
(mongoose.Model as any).updateOne = function (f: any, u: any) { const d = coll(this).filter(sift(f))[0]; if (d) Object.assign(d, u.$set || {}, { updatedAt: new Date() }); return Promise.resolve({}); };
(mongoose.Model as any).deleteOne = function (f: any) { const c = coll(this); const i = c.findIndex((d) => String(d._id) === String(f._id)); if (i >= 0) c.splice(i, 1); return Promise.resolve({}); };
const baseFindOne = (mongoose.Model as any).findOne;
// string ids (as the routes pass them) -> compare by String(_id)
(mongoose.Model as any).findOne = function (f: any = {}) {
  if (f && typeof f._id === "string") { const { _id, ...rest } = f; const hit = coll(this).filter(sift(rest)).find((d) => String(d._id) === _id); const copy = hit ? { ...hit } : null; return { lean: () => Promise.resolve(copy), then: (r: any, j: any) => Promise.resolve(copy).then(r, j) }; }
  return baseFindOne.call(this, f);
};
import assert from "node:assert";
const T = "demo";
store["employees"] = [
  { _id: asId(1), tenantSlug: T, name: "AMITH K", employeeCode: "E2", designation: "BE", division: "SUB1", territory: "KANNUR", role: "MR", status: "ACTIVE" },
  { _id: asId(2), tenantSlug: T, name: "DARSHAN B", employeeCode: "E3", designation: "ABM", division: "SUB2", territory: "BANGALORE", role: "ABM", status: "ACTIVE" }
];
const I = await import("../../src/utils/info-items.js");
// create / validate
await assert.rejects(() => I.createItem(T, "FLASH", { body: "" }, "admin"), /Content is required/);
await assert.rejects(() => I.createItem(T, "NOTICE", { body: "x", startDate: "2026-10-10", endDate: "2026-10-01" }, "admin"), /End date/);
await assert.rejects(() => I.createItem(T, "NOTICE", { body: "x", startDate: "10/10/2026" }, "admin"), /YYYY-MM-DD/);
await assert.rejects(() => I.createItem(T, "QUOTE", { body: "x", attachmentUrl: "javascript:alert(1)" }, "admin"), /Attachment/);
const f1 = await I.createItem(T, "FLASH", { body: "Sales meet on Friday", priority: "URGENT" }, "admin");
const f2 = await I.createItem(T, "FLASH", { body: "Only for ABMs", designations: ["ABM"] }, "admin");
const n1 = await I.createItem(T, "NOTICE", { title: "Policy", body: "New leave policy", pinned: true, startDate: "2026-10-01", endDate: "2026-10-31", attachmentUrl: "https://x.test/policy.pdf", attachmentName: "policy.pdf" }, "admin");
const n2 = await I.createItem(T, "NOTICE", { title: "Old", body: "Expired", endDate: "2026-09-30" }, "admin");
const n3 = await I.createItem(T, "NOTICE", { title: "Future", body: "Later", startDate: "2026-11-01" }, "admin");
const q1 = await I.createItem(T, "QUOTE", { body: "Well begun is half done", author: "Aristotle", divisions: ["SUB1"] }, "admin");
const now = new Date("2026-10-07T10:00:00Z");
// BE in SUB1 / KANNUR
let feed = await I.feedFor(T, "E2", now);
assert.deepEqual(feed.flash.map((x: any) => x.body), ["Sales meet on Friday"]);             // ABM-only flash hidden
assert.deepEqual(feed.notices.map((x: any) => x.title), ["Policy"]);                          // expired + future hidden
assert.equal(feed.notices[0].attachmentName, "policy.pdf"); assert.equal(feed.quote!.author, "Aristotle");
// ABM in SUB2
feed = await I.feedFor(T, "E3", now);
assert.deepEqual(feed.flash.map((x: any) => x.body).sort(), ["Only for ABMs", "Sales meet on Friday"]);
assert.equal(feed.flash[0].priority, "URGENT");                                               // urgent first
assert.equal(feed.quote, null);                                                               // quote is SUB1-only
// edit bumps the version; deactivate hides
const upd = await I.updateItem(T, f1.id, { body: "Sales meet moved to Saturday" });
assert.equal(upd.version, 2); assert.equal(upd.priority, "URGENT");
await I.updateItem(T, f1.id, { active: false });
assert.deepEqual((await I.feedFor(T, "E2", now)).flash, []);
await assert.rejects(() => I.updateItem(T, "not-an-id", {}), /Not found/);
await I.deleteItem(T, n1.id); assert.equal((await I.listItems(T, "NOTICE")).length, 2);
// the old single-document Flash/Notice/Quote settings are no longer delivered (they could not be removed from any screen); Talk to Us info text still is
store["companyconfigs"] = [{ tenantSlug: T, key: "adminSettings:quoteOfTheWeek", value: { quote: "Legacy quote" } }, { tenantSlug: T, key: "adminSettings:talkToUs", value: { content: "Call HR on 1800" } }];
feed = await I.feedFor(T, "E3", now);
assert.equal(feed.quote, null, "legacy quote is not a ghost item"); assert.equal(feed.talkInfo, "Call HR on 1800");
// audience options
const ao = await I.audienceOptions(T); assert.deepEqual(ao.designations, ["ABM", "BE"]); assert.deepEqual(ao.hqs, ["BANGALORE", "KANNUR"]);
// Talk to Us
await assert.rejects(() => I.createTicket(T, "E2", "", "hi"), /Subject/);
const t = await I.createTicket(T, "E2", "Need samples", "Please send more samples");
assert.equal(t.status, "OPEN"); assert.equal(t.replies[0].name, "AMITH K"); assert.equal(t.employeeName, "AMITH K");
assert.equal((await I.myTickets(T, "E3")).length, 0); assert.equal((await I.myTickets(T, "E2")).length, 1);
const a = await I.addReply(T, t.id, "ADMIN", "admin", "Dispatch next week"); assert.equal(a.status, "ANSWERED"); assert.equal(a.replies.length, 2);
await assert.rejects(() => I.addReply(T, t.id, "EMPLOYEE", "", "thanks", "E3"), /not found/i);   // another employee cannot reply
const b = await I.addReply(T, t.id, "EMPLOYEE", "", "Thanks!", "E2"); assert.equal(b.status, "OPEN");
assert.equal((await I.allTickets(T, "OPEN")).length, 1); assert.equal((await I.allTickets(T, "CLOSED")).length, 0);
await I.setTicketStatus(T, t.id, "CLOSED");
await assert.rejects(() => I.addReply(T, t.id, "EMPLOYEE", "", "again", "E2"), /closed/);
console.log("R48 info tests passed");
