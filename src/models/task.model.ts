import mongoose, { Schema } from "mongoose";

// Round 11 item 5 — real backing for the brand-new "Task Management System"
// module (Home/Assign/Status/Track), matching sanpharma.info's own Mode of
// Task categories, Priority levels and 7-state task lifecycle exactly.
const taskSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    modeOfTask: { type: String, required: true, trim: true },
    priority: { type: String, enum: ["High", "Medium", "Low"], required: true },
    assignedToEmployeeCode: { type: String, required: true, index: true },
    assignedToName: { type: String, required: true, trim: true },
    assignedByEmployeeCode: { type: String, default: null },
    assignedByName: { type: String, default: null },
    deadlineFrom: { type: Date, default: null },
    deadlineTo: { type: Date, default: null },
    description: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["New", "Pending", "Completed", "Closed", "ReOpen", "Hold", "Cancel"],
      default: "New",
      index: true
    }
  },
  { timestamps: true }
);

taskSchema.index({ tenantSlug: 1, status: 1 });

export const TaskModel = mongoose.model("Task", taskSchema, "tasks");
