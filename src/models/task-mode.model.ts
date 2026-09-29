import mongoose, { Schema } from "mongoose";

// Round 12 item 9 — sanpharma's real "Mode Of Task" admin screen (Task
// Management > Mode Creation): a genuine CRUD master of Short Name + Task
// Name pairs (e.g. AV = Allowance Variance, CA = Call Adherance, CAD =
// Campaign Doctors...) that drives the "Mode of Task" dropdown everywhere
// it's used — replacing the Round 11 hardcoded MODE_OF_TASK_OPTIONS list,
// which had no real create/edit screen behind it at all.
const taskModeSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    shortName: { type: String, required: true, trim: true },
    taskName: { type: String, required: true, trim: true }
  },
  { timestamps: true }
);

taskModeSchema.index({ tenantSlug: 1, shortName: 1 }, { unique: true });

export const TaskModeModel = mongoose.model("TaskMode", taskModeSchema, "taskmodes");
