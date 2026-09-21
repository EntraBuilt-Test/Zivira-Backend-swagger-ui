// src/utils/product-analytics.ts
// Zivira_Project_Basic.docx Topic 9 — Product Exposure Analytics
// Topic 10 — Product-wise Performance Dashboard
// Topic 12 — Sample vs Doctor Input Analysis
//
// All three topics read off data Topic 1 already captures on every DCR
// (samplesGiven, visualAidUsed, prescriptionInterest) — no new model,
// just aggregation. "Which region performs best / which manager pushes
// Product B" (Topic 10) is answered by joining Dcr.employeeCode back to
// Employee.territory/reportingManager.
import { DcrModel } from "../models/dcr.model.js";
import { EmployeeModel } from "../models/employee.model.js";

export type ProductExposureRow = {
  productCode: string;
  productName: string;
  totalSamplesGiven: number;
  visitsPromoted: number;      // distinct DCRs this product appeared in
  distinctDoctors: number;
  distinctReps: number;
  visualAidUsedCount: number;
  topRepCode?: string;
  topRepName?: string;
  topRepQty?: number;
  topTerritory?: string;
  topTerritoryQty?: number;
  topManagerCode?: string;
  topManagerName?: string;
  topManagerQty?: number;
  // Topic 12 — prescription-interest breakdown as an ROI proxy: of the
  // doctors this product was given to, how many showed HIGH/MEDIUM/LOW/NONE
  // prescription interest on that same visit.
  prescriptionInterestHigh: number;
  prescriptionInterestMedium: number;
  prescriptionInterestLow: number;
  prescriptionInterestNone: number;
};

export async function computeProductExposureRows(tenantSlug: string, month?: string): Promise<ProductExposureRow[]> {
  const match: Record<string, unknown> = { tenantSlug, status: { $ne: "REJECTED" } };
  if (month) match.month = month;

  const [rows, employees] = await Promise.all([
    DcrModel.aggregate([
      { $match: match },
      { $unwind: { path: "$samplesGiven", preserveNullAndEmptyArrays: false } },
      { $group: {
          _id: { productCode: "$samplesGiven.productCode", productName: "$samplesGiven.productName" },
          totalSamplesGiven: { $sum: "$samplesGiven.qty" },
          visitDcrIds: { $addToSet: "$_id" },
          doctorIds: { $addToSet: "$doctorId" },
          repQty: { $push: { employeeCode: "$employeeCode", qty: "$samplesGiven.qty" } },
          visualAidUsedCount: { $sum: { $cond: ["$visualAidUsed", 1, 0] } },
          prescriptionInterestHigh:   { $sum: { $cond: [{ $eq: ["$prescriptionInterest", "HIGH"] }, 1, 0] } },
          prescriptionInterestMedium: { $sum: { $cond: [{ $eq: ["$prescriptionInterest", "MEDIUM"] }, 1, 0] } },
          prescriptionInterestLow:    { $sum: { $cond: [{ $eq: ["$prescriptionInterest", "LOW"] }, 1, 0] } },
          prescriptionInterestNone:   { $sum: { $cond: [{ $eq: ["$prescriptionInterest", "NONE"] }, 1, 0] } }
      } }
    ]),
    EmployeeModel.find({ tenantSlug }, { employeeCode: 1, name: 1, territory: 1, reportingManager: 1 }).lean()
  ]);

  const employeeByCode = new Map(employees.map(e => [e.employeeCode, e]));
  const managerNameByCode = new Map(employees.map(e => [e.employeeCode, e.name]));

  return rows.map(r => {
    // Roll up rep-level qty for "top rep", and via territory/manager lookup
    // roll up territory-level and manager-level qty too.
    const repTotals = new Map<string, number>();
    const territoryTotals = new Map<string, number>();
    const managerTotals = new Map<string, number>();

    for (const entry of r.repQty as { employeeCode: string; qty: number }[]) {
      repTotals.set(entry.employeeCode, (repTotals.get(entry.employeeCode) ?? 0) + entry.qty);
      const emp = employeeByCode.get(entry.employeeCode);
      if (emp?.territory) territoryTotals.set(emp.territory, (territoryTotals.get(emp.territory) ?? 0) + entry.qty);
      if (emp?.reportingManager) managerTotals.set(emp.reportingManager, (managerTotals.get(emp.reportingManager) ?? 0) + entry.qty);
    }

    const topOf = (map: Map<string, number>) => {
      let bestKey: string | undefined, bestQty = -1;
      for (const [k, v] of map) if (v > bestQty) { bestKey = k; bestQty = v; }
      return bestKey ? { key: bestKey, qty: bestQty } : undefined;
    };

    const topRep = topOf(repTotals);
    const topTerritory = topOf(territoryTotals);
    const topManager = topOf(managerTotals);

    return {
      productCode: r._id.productCode ?? "UNKNOWN",
      productName: r._id.productName ?? "Unknown product",
      totalSamplesGiven: r.totalSamplesGiven ?? 0,
      visitsPromoted: r.visitDcrIds?.length ?? 0,
      distinctDoctors: r.doctorIds?.filter((d: unknown) => d).length ?? 0,
      distinctReps: repTotals.size,
      visualAidUsedCount: r.visualAidUsedCount ?? 0,
      topRepCode: topRep?.key,
      topRepName: topRep ? employeeByCode.get(topRep.key)?.name : undefined,
      topRepQty: topRep?.qty,
      topTerritory: topTerritory?.key,
      topTerritoryQty: topTerritory?.qty,
      topManagerCode: topManager?.key,
      topManagerName: topManager ? managerNameByCode.get(topManager.key) : undefined,
      topManagerQty: topManager?.qty,
      prescriptionInterestHigh: r.prescriptionInterestHigh ?? 0,
      prescriptionInterestMedium: r.prescriptionInterestMedium ?? 0,
      prescriptionInterestLow: r.prescriptionInterestLow ?? 0,
      prescriptionInterestNone: r.prescriptionInterestNone ?? 0
    };
  }).sort((a, b) => b.totalSamplesGiven - a.totalSamplesGiven);
}
