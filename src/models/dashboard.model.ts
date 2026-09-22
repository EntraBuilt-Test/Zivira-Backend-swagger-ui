import mongoose, { Schema } from "mongoose";

// Backs the "Options > Dashboard" screen — a real dashboard-builder feature
// mirroring sanpharma.info's MasterFiles/DynamicDashboard/Dashboard.aspx
// flow (module tabs -> named dashboards -> up to 6 widgets each, each widget
// a category+dimension aggregation chart). Replaces the old generic-table
// "optionsDashboardWidget" master (Name/Value/Description/Status rows),
// which had no real behavior behind it.
const MAX_WIDGETS_PER_DASHBOARD = 6;

const widgetSchema = new Schema(
  {
    widgetName: { type: String, required: true, trim: true },
    // Top-level left-panel group, e.g. "Listed Doctors", "Chemist", "Field Force".
    category: { type: String, required: true, trim: true },
    // The selected leaf under that category, e.g. "Speciality", "Campaign".
    dimension: { type: String, required: true, trim: true },
    // Optional second dimension from the same category — stored for the UI
    // but NOT currently folded into the aggregation query (see
    // dashboard.routes.ts widget-data handler for the honest caveat).
    splitBy: { type: String, trim: true, default: "None" },
    chartType: {
      type: String,
      enum: ["pie", "donut", "bar", "line", "area", "funnel", "table"],
      default: "pie"
    }
  },
  { timestamps: true }
);

const dashboardSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    module: { type: String, enum: ["Master KPI", "Marketing KPI", "Sales KPI"], required: true, index: true },
    widgets: { type: [widgetSchema], default: [] },
    createdBy: { type: String, trim: true, default: null }
  },
  { timestamps: true }
);

dashboardSchema.path("widgets").validate(function (widgets: unknown[]) {
  return widgets.length <= MAX_WIDGETS_PER_DASHBOARD;
}, `A dashboard can hold at most ${MAX_WIDGETS_PER_DASHBOARD} widgets`);

dashboardSchema.index({ tenantSlug: 1, module: 1, name: 1 });

export const DASHBOARD_MAX_WIDGETS = MAX_WIDGETS_PER_DASHBOARD;
export const DashboardModel = mongoose.model("Dashboard", dashboardSchema, "dashboards");
