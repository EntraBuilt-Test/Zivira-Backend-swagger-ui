// src/utils/sample-distribution.ts
// Zivira_Project_Basic.docx Topic 11 — Sample Distribution Analytics
// Reports: Total Samples Issued, Samples Distributed, Samples Remaining,
// Doctor-wise Samples, Product-wise Samples.
import { DcrModel } from "../models/dcr.model.js";
import { SampleAllocationModel } from "../models/sample-allocation.model.js";
import { DoctorModel } from "../models/doctor.model.js";
import { EmployeeModel } from "../models/employee.model.js";

export type RepSampleBalanceRow = {
  employeeCode: string;
  employeeName?: string;
  totalIssued: number;
  totalDistributed: number;
  totalRemaining: number;
};

export type DoctorSampleRow = {
  doctorId: string;
  doctorName: string;
  totalSamplesReceived: number;
};

export type ProductSampleRow = {
  productCode: string;
  productName: string;
  totalIssued: number;
  totalDistributed: number;
  totalRemaining: number;
};

export async function computeSampleDistribution(tenantSlug: string, month?: string) {
  const dcrMatch: Record<string, unknown> = { tenantSlug, status: { $ne: "REJECTED" } };
  const allocationMatch: Record<string, unknown> = { tenantSlug };
  if (month) { dcrMatch.month = month; allocationMatch.month = month; }

  const [issuedByRep, issuedByProduct, distributedByRep, distributedByProduct, distributedByDoctor, employees, doctors] = await Promise.all([
    SampleAllocationModel.aggregate([
      { $match: allocationMatch },
      { $group: { _id: "$employeeCode", totalIssued: { $sum: "$qtyIssued" } } }
    ]),
    SampleAllocationModel.aggregate([
      { $match: allocationMatch },
      { $group: { _id: { productCode: "$productCode", productName: "$productName" }, totalIssued: { $sum: "$qtyIssued" } } }
    ]),
    DcrModel.aggregate([
      { $match: dcrMatch },
      { $unwind: "$samplesGiven" },
      { $group: { _id: "$employeeCode", totalDistributed: { $sum: "$samplesGiven.qty" } } }
    ]),
    DcrModel.aggregate([
      { $match: dcrMatch },
      { $unwind: "$samplesGiven" },
      { $group: { _id: { productCode: "$samplesGiven.productCode", productName: "$samplesGiven.productName" }, totalDistributed: { $sum: "$samplesGiven.qty" } } }
    ]),
    DcrModel.aggregate([
      { $match: dcrMatch },
      { $unwind: "$samplesGiven" },
      { $group: { _id: "$doctorId", totalSamplesReceived: { $sum: "$samplesGiven.qty" } } }
    ]),
    EmployeeModel.find({ tenantSlug }, { employeeCode: 1, name: 1 }).lean(),
    DoctorModel.find({ tenantSlug }, { name: 1 }).lean()
  ]);

  const employeeNameByCode = new Map(employees.map(e => [e.employeeCode, e.name]));
  const doctorNameById = new Map(doctors.map(d => [String(d._id), d.name]));

  const issuedByRepMap = new Map(issuedByRep.map(r => [r._id as string, r.totalIssued as number]));
  const distributedByRepMap = new Map(distributedByRep.map(r => [r._id as string, r.totalDistributed as number]));
  const repCodes = new Set([...issuedByRepMap.keys(), ...distributedByRepMap.keys()]);
  const byRep: RepSampleBalanceRow[] = Array.from(repCodes).map(code => {
    const totalIssued = issuedByRepMap.get(code) ?? 0;
    const totalDistributed = distributedByRepMap.get(code) ?? 0;
    return { employeeCode: code, employeeName: employeeNameByCode.get(code), totalIssued, totalDistributed, totalRemaining: totalIssued - totalDistributed };
  }).sort((a, b) => (b.totalIssued) - (a.totalIssued));

  const issuedByProductMap = new Map(issuedByProduct.map(r => [r._id.productCode as string, r]));
  const distributedByProductMap = new Map(distributedByProduct.map(r => [r._id.productCode as string, r]));
  const productCodes = new Set([...issuedByProductMap.keys(), ...distributedByProductMap.keys()]);
  const byProduct: ProductSampleRow[] = Array.from(productCodes).map(code => {
    const issued = issuedByProductMap.get(code);
    const distributed = distributedByProductMap.get(code);
    const totalIssued = issued?.totalIssued ?? 0;
    const totalDistributed = distributed?.totalDistributed ?? 0;
    return {
      productCode: code,
      productName: issued?._id.productName ?? distributed?._id.productName ?? code,
      totalIssued, totalDistributed, totalRemaining: totalIssued - totalDistributed
    };
  }).sort((a, b) => b.totalDistributed - a.totalDistributed);

  const byDoctor: DoctorSampleRow[] = distributedByDoctor
    .filter(r => r._id)
    .map(r => ({ doctorId: String(r._id), doctorName: doctorNameById.get(String(r._id)) ?? "Unknown doctor", totalSamplesReceived: r.totalSamplesReceived as number }))
    .sort((a, b) => b.totalSamplesReceived - a.totalSamplesReceived);

  const totals = {
    totalIssued: byRep.reduce((s, r) => s + r.totalIssued, 0),
    totalDistributed: byRep.reduce((s, r) => s + r.totalDistributed, 0),
    totalRemaining: byRep.reduce((s, r) => s + r.totalRemaining, 0)
  };

  return { byRep, byProduct, byDoctor, totals };
}
