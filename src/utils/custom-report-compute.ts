// Round 36 Item 1 -- expanded real computation for the Customized Report
// builder's output. Pulled out of company.routes.ts into its own module
// since the Round 35 inline version was about to triple in size.
//
// Every metric here is computed from data that genuinely exists in this
// schema today; nothing is invented. See the bottom of this file and
// custom-report-metrics.ts's COMPUTED_METRIC_KEYS for the authoritative
// list of what is/isn't real. A metric category entirely absent from this
// file (Category Coverage, Doctor Category Info/Visit Info/Call
// Adherance, Call Type, Class wise, Speciality/Campaign/Product/Brand
// Exposure selections, Call Feedback, Missed Date Info, RCPA) has no real
// backing data anywhere in this schema -- the only real doctor
// classification fields are Doctor.category (A/B/C) and the separate
// binary isCore flag (managerwiseCoreDoctorMap), neither of which maps to
// the legacy's 4-tier Nil/CORE/NON CORE/SUPER CORE scheme, so fabricating
// that mapping was avoided rather than guessed.

import { EmployeeModel } from "../models/employee.model.js";
import { DcrModel } from "../models/dcr.model.js";
import { DoctorModel } from "../models/doctor.model.js";
import { ChemistCallModel } from "../models/chemist-call.model.js";
import { StockistModel } from "../models/stockist.model.js";
import { HospitalModel } from "../models/hospital.model.js";
import { UnlistedDoctorModel } from "../models/unlisted-doctor.model.js";
import { ExpenseClaimModel } from "../models/expense-claim.model.js";
import { LeaveApplicationModel } from "../models/leave-application.model.js";
import { QuizModel } from "../models/quiz.model.js";
import { QuizAttemptModel } from "../models/quiz-attempt.model.js";
import { getMasterModel } from "../models/master-record.model.js";
import { buildDayStatusContext, classifyDay } from "./day-status.js";

function daysInMonth(month: string): number {
  const [year, mon] = month.split("-").map((v) => parseInt(v, 10));
  return new Date(Date.UTC(year, mon, 0)).getUTCDate();
}
function dateKey(month: string, day: number): string {
  return `${month}-${String(day).padStart(2, "0")}`;
}

export async function computeCustomReportMetrics(
  tenantSlug: string,
  employeeCode: string,
  month: string
): Promise<Record<string, number | string>> {
  const employee = await EmployeeModel.findOne({ tenantSlug, employeeCode }).lean();
  if (!employee) return {};
  const emp = employee as any;
  const numDays = daysInMonth(month);
  const [year, mon] = month.split("-").map((v) => parseInt(v, 10));
  const monthStart = new Date(Date.UTC(year, mon - 1, 1));
  const monthEnd = new Date(Date.UTC(year, mon, 1));

  // ── Working Info + Tour Plan Info (Round 35, unchanged) ───────────────
  const ctx = await buildDayStatusContext(tenantSlug, month, [employeeCode], [emp.state]);
  const dcrs = await DcrModel.find({ tenantSlug, employeeCode, month }).populate("doctorId").lean();
  const submittedDates = new Set((dcrs as any[]).map((d) => d.visitDateOnly));
  let fwDays = 0, holidaySunday = 0, leaveDaysCount = 0;
  let hqPlanned = 0, exPlanned = 0, osPlanned = 0, hqWorked = 0, exWorked = 0, osWorked = 0;
  let tpDeviationDays = 0;
  for (let d = 1; d <= numDays; d++) {
    const key = dateKey(month, d);
    const status = classifyDay(ctx, employeeCode, key);
    if (status.kind === "tour") {
      fwDays++;
      const isEx = /ex/i.test(status.area || "");
      const isOs = /os/i.test(status.area || "");
      if (isEx) exPlanned++; else if (isOs) osPlanned++; else hqPlanned++;
      if (submittedDates.has(key)) {
        if (isEx) exWorked++; else if (isOs) osWorked++; else hqWorked++;
      } else {
        tpDeviationDays++; // planned but not submitted -- same concept as Item 2's "Not Submitted"
      }
    } else if (status.kind === "holiday" || status.kind === "weeklyOff") holidaySunday++;
    else if (status.kind === "leave") leaveDaysCount++;
  }

  // ── Master Info (real list counts, mapped to this rep) ────────────────
  const [totalDoctorsInList, totalChemistInList, totalUnlistedDrsInList, totalStockistInList, totalHospitalInList] = await Promise.all([
    DoctorModel.countDocuments({ tenantSlug, mappedEmployeeCode: employeeCode, status: "ACTIVE" }),
    getMasterModel("dealers").countDocuments({ tenantSlug, employeeCode, status: "ACTIVE" }),
    UnlistedDoctorModel.countDocuments({ tenantSlug, mr: emp.name }),
    StockistModel.countDocuments({ tenantSlug, fieldForceName: emp.name, status: "ACTIVE" }),
    HospitalModel.countDocuments({ tenantSlug, medicalRepresentative: emp.name, status: "ACTIVE" })
  ]);

  // ── Listed Dr Info ──────────────────────────────────────────────────
  const listedDoctorIds = new Set((dcrs as any[]).map((d) => String(d.doctorId?._id || d.doctorId)));
  const listedDrsMet = listedDoctorIds.size;
  // "Seen" has no distinct real concept from "Met" anywhere in this
  // schema (one DCR row = one real visit event) -- aliased, not fabricated.
  const listedDrsSeen = listedDrsMet;
  const lstDrCoveragePct = totalDoctorsInList > 0 ? +((listedDrsMet / totalDoctorsInList) * 100).toFixed(1) : 0;
  const lstDrCallAverage = fwDays > 0 ? +(dcrs.length / fwDays).toFixed(2) : 0;
  const lstDrMissedCall = Math.max(totalDoctorsInList - listedDrsMet, 0);

  // ── Chemists Info ───────────────────────────────────────────────────
  const chemistCalls = await ChemistCallModel.find({ tenantSlug, employeeCode, visitDateOnly: { $regex: `^${month}` } }).lean();
  const chemistsMet = chemistCalls.length;
  const chemistsSeen = chemistsMet; // same alias rationale as Listed Dr Seen
  const chemCoveragePct = totalChemistInList > 0 ? +((chemistsMet / totalChemistInList) * 100).toFixed(1) : 0;
  const chemCallAverage = fwDays > 0 ? +(chemistsMet / fwDays).toFixed(2) : 0;
  const chemMissedChemist = Math.max(totalChemistInList - chemistsMet, 0);

  // ── Drs Visit frequency buckets (real per-doctor visit counts) ────────
  const visitCountByDoctor = new Map<string, number>();
  for (const d of dcrs as any[]) {
    const id = String(d.doctorId?._id || d.doctorId);
    visitCountByDoctor.set(id, (visitCountByDoctor.get(id) || 0) + 1);
  }
  let visit1Drs = 0, visit2Drs = 0, visit3Drs = 0, visitMoreThan3Drs = 0;
  for (const count of visitCountByDoctor.values()) {
    if (count === 1) visit1Drs++;
    else if (count === 2) visit2Drs++;
    else if (count === 3) visit3Drs++;
    else if (count > 3) visitMoreThan3Drs++;
  }
  const pct = (n: number) => (totalDoctorsInList > 0 ? +((n / totalDoctorsInList) * 100).toFixed(1) : 0);

  // ── Join Work Info ──────────────────────────────────────────────────
  const jointDcrs = (dcrs as any[]).filter((d) => d.jointWork?.accompanyingManager);
  const jointWorkDates = new Set(jointDcrs.map((d) => d.visitDateOnly));
  const jointWorkDays = jointWorkDates.size;
  const jointCallsMet = jointDcrs.length;
  const jointCallsSeen = jointCallsMet;
  const jointCallAvg = jointWorkDays > 0 ? +(jointCallsMet / jointWorkDays).toFixed(2) : 0;

  // ── Sample/Input Info (real, from DcrModel's own structured arrays) ──
  let sampleGivenDrsSet = new Set<string>(), inputGivenDrsSet = new Set<string>();
  let sampleProducts = new Set<string>(), inputProducts = new Set<string>();
  let sampleQty = 0, inputQty = 0;
  for (const d of dcrs as any[]) {
    const docId = String(d.doctorId?._id || d.doctorId);
    if ((d.samplesGiven || []).length > 0) {
      sampleGivenDrsSet.add(docId);
      for (const s of d.samplesGiven) { sampleProducts.add(s.productName); sampleQty += s.qty || 0; }
    }
    if ((d.inputsGiven || []).length > 0) {
      inputGivenDrsSet.add(docId);
      for (const inp of d.inputsGiven) { inputProducts.add(inp.inputName); inputQty += inp.qty || 0; }
    }
  }

  // ── Core Drs Info (real isCore tagging) ────────────────────────────
  let coreDrsTagged = 0, coreDrsMet = 0;
  try {
    const CoreMapModel = getMasterModel("managerwiseCoreDoctorMap");
    const coreRows = await CoreMapModel.find({ tenantSlug, mrName: emp.name, isCore: "Yes" }).lean();
    coreDrsTagged = coreRows.length;
    const coreDoctorCodes = new Set((coreRows as any[]).map((r) => r.doctorCode));
    const metDoctorCodes = new Set((dcrs as any[]).map((d) => d.doctorId?.doctorCode).filter(Boolean));
    coreDrsMet = Array.from(coreDoctorCodes).filter((c) => metDoctorCodes.has(c)).length;
  } catch {
    coreDrsTagged = 0; coreDrsMet = 0;
  }
  const coreDrsMissed = Math.max(coreDrsTagged - coreDrsMet, 0);
  const coreDrsCoveragePct = coreDrsTagged > 0 ? +((coreDrsMet / coreDrsTagged) * 100).toFixed(1) : 0;

  // ── Expense Info (real Total Amount + Miscellaneous; no HQ/EX/OS split
  // or km field exists in ExpenseClaimModel, so those stay unsupported) ──
  const expenses = await ExpenseClaimModel.find({ tenantSlug, employeeCode, month, status: { $ne: "REJECTED" } }).lean();
  const totalAmount = (expenses as any[]).reduce((sum, e) => sum + (e.amountRs || 0), 0);
  const miscellaneous = (expenses as any[]).filter((e) => e.category === "Other").reduce((sum, e) => sum + (e.amountRs || 0), 0);

  // ── Leave Info (real Taken counts by leaveType substring match; no
  // eligibility/balance schema exists anywhere, so *Eligibility stays
  // unsupported) ──────────────────────────────────────────────────────
  const leaves = await LeaveApplicationModel.find({
    tenantSlug, employeeCode, status: "APPROVED",
    fromDate: { $lt: monthEnd }, toDate: { $gte: monthStart }
  }).lean();
  const sumDaysWhere = (pred: (l: any) => boolean) => (leaves as any[]).filter(pred).reduce((s, l) => s + (l.days || 0), 0);
  const clTaken = sumDaysWhere((l) => /\bcl\b|casual/i.test(l.leaveType || "") && !l.isLWP);
  const plTaken = sumDaysWhere((l) => /\bpl\b|privileged|earned/i.test(l.leaveType || "") && !l.isLWP);
  const slTaken = sumDaysWhere((l) => /\bsl\b|sick/i.test(l.leaveType || "") && !l.isLWP);
  const lopTaken = sumDaysWhere((l) => l.isLWP);

  // ── Target Info (real HQ-keyed Target/Primary/Secondary Sales masters)
  let target = 0, primarySale = 0, secondarySale = 0;
  try {
    const [targets, primary, secondary] = await Promise.all([
      getMasterModel("targetMaster").find({ tenantSlug, hq: emp.territory, month }).lean(),
      getMasterModel("primarySales").find({ tenantSlug, hq: emp.territory, month }).lean(),
      getMasterModel("secondarySales").find({ tenantSlug, hq: emp.territory, month }).lean()
    ]);
    target = (targets as any[]).reduce((s, t) => s + (t.targetValue || 0), 0);
    primarySale = (primary as any[]).reduce((s, t) => s + (t.salesValue || 0), 0);
    secondarySale = (secondary as any[]).reduce((s, t) => s + (t.salesValue || 0), 0);
  } catch {
    target = 0; primarySale = 0; secondarySale = 0;
  }
  const achievement = target > 0 ? +((primarySale / target) * 100).toFixed(1) : 0;

  // ── Online Quiz (real QuizModel + QuizAttemptModel) ───────────────────
  const [quizzesRaised, attempts] = await Promise.all([
    QuizModel.countDocuments({ tenantSlug, isActive: true, month }),
    QuizAttemptModel.find({ tenantSlug, employeeCode, submittedAt: { $gte: monthStart, $lt: monthEnd } }).lean()
  ]);
  const quizAttended = attempts.length;
  const quizTotalQuestions = (attempts as any[]).reduce((s, a) => s + (a.answers?.length || 0), 0);
  const quizMarksObtained = (attempts as any[]).reduce((s, a) => s + (a.score || 0), 0);
  const quizTotalPossible = (attempts as any[]).reduce((s, a) => s + (a.totalPossible || 0), 0);
  const quizPercentage = quizTotalPossible > 0 ? +((quizMarksObtained / quizTotalPossible) * 100).toFixed(1) : 0;

  return {
    // Working Info
    daysInMonth: numDays, fwDays, nfwDays: numDays - fwDays, leave: leaveDaysCount, holidaySunday,
    // Master Info
    totalDoctorsInList, totalChemistInList, totalUnlistedDrsInList, totalStockistInList, totalHospitalInList,
    // Listed Dr Info
    listedDrsMet, listedDrsSeen, lstDrCoveragePct, lstDrCallAverage, lstDrMissedCall,
    // Chemists Info
    chemistsMet, chemistsSeen, chemCoveragePct, chemCallAverage, chemMissedChemist,
    // Drs Visit
    visit1Drs, visit2Drs, visit3Drs, visitMoreThan3Drs,
    visit1CoveragePct: pct(visit1Drs), visit2CoveragePct: pct(visit2Drs), visit3CoveragePct: pct(visit3Drs), visitMoreThan3CoveragePct: pct(visitMoreThan3Drs),
    // Join Work Info
    jointWorkDays, jointCallsMet, jointCallsSeen, jointCallAvg,
    // Sample/Input Info
    sampleGivenDrs: sampleGivenDrsSet.size, sampleGivenProducts: sampleProducts.size, sampleGivenQty: sampleQty,
    inputGivenDrs: inputGivenDrsSet.size, inputGivenProducts: inputProducts.size, inputGivenQty: inputQty,
    // Tour Plan Info
    noOfHqPlanned: hqPlanned, noOfExPlanned: exPlanned, noOfOsPlanned: osPlanned,
    actualHqWorked: hqWorked, actualExWorked: exWorked, actualOsWorked: osWorked,
    noOfTpDeviationDays: tpDeviationDays,
    // Core Drs Info
    coreDrsTagged, coreDrsMet, coreDrsSeen: coreDrsMet, coreDrsMissed, coreDrsCoveragePct,
    // Expense Info
    totalAmount, miscellaneous,
    // Leave Info
    clTaken, plTaken, slTaken, lopTaken,
    // Target Info
    target, primarySale, secondarySale, achievement,
    // Online Quiz
    quizRaised: quizzesRaised, quizAttended, quizTotalQuestions, quizMarksObtained, quizPercentage
  };
}
