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
import { LeaveApplicationModel } from "../models/leave-application.model.js";
import { QuizModel } from "../models/quiz.model.js";
import { QuizAttemptModel } from "../models/quiz-attempt.model.js";
import { getMasterModel } from "../models/master-record.model.js";
import { buildDayStatusContext, classifyDay } from "./day-status.js";
import { RcpaModel } from "../models/rcpa.model.js";
import { loadRateMap, docPobValue, hasPob } from "./mis-reports-compute.js";
import { computeDelayStats, computeExpenseSplit, computeSpend, computeOtherVisits, computeTierStats } from "./r41-metrics.js";

// Round 41 update: the 4-tier doctor category (DoctorModel.doctorCategory),
// unlisted/stockist/hospital visits, RCPA/CRM, DCR locks, expense split and
// leave eligibility now have real backing and are computed in the "Round 41
// extras" block near the bottom of computeCustomReportMetrics (which
// overrides the older zero placeholders above it). Only EX/OS fare (kms) and
// Fixed Expenses remain without any data source.

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

  // ── Round 37 Item 2 -- Call Type (HQ/EX/OS Days/List/Met/Seen/
  // Coverage(%), Morning/Evening Calls) ──────────────────────────────
  // Days reuse the same real per-day HQ/EX/OS classification as Tour Plan
  // Info above (classifyDay's status.area). Met/Seen are aliased (one DCR
  // row = one real visit event, same rationale as Listed Dr Met/Seen
  // above) and counted by looking up each DCR's own day's HQ/EX/OS bucket.
  // List is the same totalDoctorsInList for every bucket -- this schema
  // has no separate "doctors assigned per territory type" master, only
  // one flat per-rep doctor list, so the same real total is honestly
  // reused rather than fabricating a split.
  const hqMetSet = new Set<string>(), exMetSet = new Set<string>(), osMetSet = new Set<string>();
  let morningCalls = 0, eveningCalls = 0;
  for (const d of dcrs as any[]) {
    const docId = String(d.doctorId?._id || d.doctorId);
    const dayStatus = classifyDay(ctx, employeeCode, d.visitDateOnly);
    const area = dayStatus.kind === "tour" ? dayStatus.area : "";
    const isEx = /ex/i.test(area || "");
    const isOs = /os/i.test(area || "");
    if (isEx) exMetSet.add(docId); else if (isOs) osMetSet.add(docId); else hqMetSet.add(docId);
    if (d.callSession === "MORNING") morningCalls++;
    else if (d.callSession === "EVENING") eveningCalls++;
  }
  const covPct = (n: number) => (totalDoctorsInList > 0 ? +((n / totalDoctorsInList) * 100).toFixed(1) : 0);

  // ── Round 37 Item 2 -- Class wise (Nil/A/B/C List/Met/Seen/Coverage) ──
  // DoctorModel.category is a real A/B/C enum (no separate "Nil"/
  // unclassified state exists -- the field defaults to "C" for every
  // doctor, so a genuinely-unclassified "Nil" tier cannot be
  // distinguished from a real "C" doctor in this schema). Nil is
  // honestly reported as 0 rather than guessed from C's numbers.
  const myDoctors = await DoctorModel.find({ tenantSlug, mappedEmployeeCode: employeeCode, status: "ACTIVE" }).select("category").lean();
  const classListByTier: Record<"A" | "B" | "C", number> = { A: 0, B: 0, C: 0 };
  for (const doc of myDoctors as any[]) {
    const cat: "A" | "B" | "C" = (doc.category === "A" || doc.category === "B") ? doc.category : "C";
    classListByTier[cat]++;
  }
  const classMetByTier: Record<"A" | "B" | "C", Set<string>> = { A: new Set(), B: new Set(), C: new Set() };
  const doctorCategoryById = new Map((myDoctors as any[]).map((doc) => [String(doc._id), (doc.category === "A" || doc.category === "B") ? doc.category : "C"]));
  for (const d of dcrs as any[]) {
    const docId = String(d.doctorId?._id || d.doctorId);
    const cat = doctorCategoryById.get(docId);
    if (cat) classMetByTier[cat as "A" | "B" | "C"].add(docId);
  }
  const classCoverage = (tier: "A" | "B" | "C") => (classListByTier[tier] > 0 ? +((classMetByTier[tier].size / classListByTier[tier]) * 100).toFixed(1) : 0);

  // ── Round 37 Item 2 -- Speciality Analysis / Campaign Info List/Met/
  // Seen/Missed. Speciality is real (DoctorModel.specialty, matched
  // against this rep's own DCR visits). Campaign has no real per-visit
  // campaign-attendance link anywhere in this schema (CampaignVisitModel
  // tracks planned/completed visits, not which marketing campaign a visit
  // belonged to) -- honestly reported as 0/unsupported rather than
  // fabricated.
  const myDoctorsWithSpecialty = await DoctorModel.find({ tenantSlug, mappedEmployeeCode: employeeCode, status: "ACTIVE" }).select("specialty").lean();
  const specialityList = new Set((myDoctorsWithSpecialty as any[]).map((d) => d.specialty).filter(Boolean)).size;
  const specialtyByDoctorId = new Map((myDoctorsWithSpecialty as any[]).map((d) => [String(d._id), d.specialty]));
  const specialitiesMet = new Set<string>();
  for (const d of dcrs as any[]) {
    const docId = String(d.doctorId?._id || d.doctorId);
    const spec = specialtyByDoctorId.get(docId);
    if (spec) specialitiesMet.add(spec);
  }
  const specialityMet = specialitiesMet.size;
  const specialitySeen = specialityMet;
  const specialityMissed = Math.max(specialityList - specialityMet, 0);

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
  const tierRun = await computeTierStats(tenantSlug, emp, dcrs as any[]);
  const coreDrsTagged = tierRun.stats.CORE.list;
  const coreDrsMet = tierRun.stats.CORE.met;
  const coreDrsMissed = Math.max(coreDrsTagged - coreDrsMet, 0);
  const coreDrsCoveragePct = coreDrsTagged > 0 ? +((coreDrsMet / coreDrsTagged) * 100).toFixed(1) : 0;

  // ── Expense Info (real Total Amount + Miscellaneous; no HQ/EX/OS split
  // or km field exists in ExpenseClaimModel, so those stay unsupported) ──
  const expenseSplit = await computeExpenseSplit(tenantSlug, employeeCode, month);
  const totalAmount = expenseSplit.total;
  const miscellaneous = expenseSplit.misc;

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

  // ── Round 41 extras ───────────────────────────────────────────────────
  const rates = await loadRateMap(tenantSlug);
  const [others, delay, rcpaRows, entitlementRows, prevPrimary] = await Promise.all([
    computeOtherVisits(tenantSlug, employeeCode, month),
    computeDelayStats(tenantSlug, emp, month),
    RcpaModel.find({ tenantSlug, employeeCode, month }).lean() as Promise<any[]>,
    (async () => {
      try { return (await getMasterModel("leaveEntitlementEntry").find({ tenantSlug, employeeCode, year: String(year) }).lean()) as any[]; } catch { return []; }
    })(),
    (async () => {
      try {
        const prev = mon === 1 ? `${year - 1}-12` : `${year}-${String(mon - 1).padStart(2, "0")}`;
        const rows = (await getMasterModel("primarySales").find({ tenantSlug, hq: emp.territory, month: prev }).lean()) as any[];
        return rows.reduce((sum: number, r: any) => sum + (r.salesValue || 0), 0);
      } catch { return 0; }
    })()
  ]);
  const spend = await computeSpend(tenantSlug, dcrs as any[], rates, employeeCode, month);
  const T = tierRun.stats;
  const tierKey = { Nil: "nil", CORE: "core", "N CORE": "nonCore", "S CORE": "superCore" } as const;
  const tierMetrics: Record<string, number> = {};
  for (const tier of ["Nil", "CORE", "N CORE", "S CORE"] as const) {
    const k = tierKey[tier]; const st = T[tier];
    tierMetrics[`${k}List`] = st.list; tierMetrics[`${k}Met`] = st.met; tierMetrics[`${k}Seen`] = st.seen;
    tierMetrics[`${k}CoveragePct`] = st.list ? +((st.met / st.list) * 100).toFixed(1) : 0;
    tierMetrics[`${k}Met2x`] = st.adhered; // visits >= the configured norm for the tier
    tierMetrics[`${k}AdherCoverage`] = st.list ? +((st.adhered / st.list) * 100).toFixed(1) : 0;
    tierMetrics[`${k}Missed`] = Math.max(st.list - st.adhered, 0);
  }
  const campaignDocs = (await DoctorModel.find({ tenantSlug, mappedEmployeeCode: employeeCode, status: "ACTIVE", campaign: { $nin: [null, ""] } }).select("_id").lean()) as any[];
  const campaignIds = new Set(campaignDocs.map((d) => String(d._id)));
  const campaignMetSet = new Set<string>(); let campaignSeenCount = 0;
  for (const d of dcrs as any[]) { const id = String(d.doctorId?._id || d.doctorId); if (campaignIds.has(id)) { campaignMetSet.add(id); campaignSeenCount++; } }
  const unlistedSeen = others.unlisted.seen;
  const rateOf = (name: string) => rates.get(String(name).trim().toLowerCase()) || 0;
  const potential = rcpaRows.reduce((sum: number, r: any) => sum + (r.ourQty + (r.competitorQty || 0)) * rateOf(r.ourProduct), 0);
  const rcpaYield = rcpaRows.reduce((sum: number, r: any) => sum + r.ourQty * rateOf(r.ourProduct), 0);
  const ent = (entitlementRows as any[])[0] || {};
  const repeated = visit2Drs + visit3Drs + visitMoreThan3Drs;
  const extra: Record<string, number> = {
    ...tierMetrics,
    unlistedDrsMet: others.unlisted.met, unlistedDrsSeen: unlistedSeen,
    unlstCoveragePct: totalUnlistedDrsInList > 0 ? +((others.unlisted.met / totalUnlistedDrsInList) * 100).toFixed(1) : 0,
    unlstCallAverage: fwDays > 0 ? +(unlistedSeen / fwDays).toFixed(2) : 0,
    unlstMissedCall: Math.max(totalUnlistedDrsInList - others.unlisted.met, 0),
    stockistMet: others.stockist.met, stockistSeen: others.stockist.seen,
    hospitalMet: others.hospital.met, hospitalSeen: others.hospital.seen,
    cipMet: others.cip.met, cipSeen: others.cip.seen,
    listedUnlistedDrsSeen: dcrs.length + unlistedSeen,
    lstUnlstCallAverage: fwDays > 0 ? +((dcrs.length + unlistedSeen) / fwDays).toFixed(2) : 0,
    repeatedCallsMet: repeated, repeatedCoveragePct: pct(repeated),
    campaignList: campaignIds.size, campaignMet: campaignMetSet.size, campaignSeen: campaignSeenCount, campaignMissed: Math.max(campaignIds.size - campaignMetSet.size, 0),
    noOfDetailingDrs: new Set((dcrs as any[]).filter((d) => (d.productsDetailed || []).length > 0).map((d) => String(d.doctorId?._id || d.doctorId))).size,
    noOfRxDrs: new Set((dcrs as any[]).filter((d) => (d.rxItems || []).some((r: any) => (r.qty || 0) > 0)).map((d) => String(d.doctorId?._id || d.doctorId))).size,
    callFeedbackSeen: (dcrs as any[]).filter((d) => d.productFeedback || d.prescriptionInterest || d.notes).length,
    rcpaDrsCount: new Set(rcpaRows.map((r: any) => r.doctorId)).size, totalPotentialRs: +potential.toFixed(2), yieldRs: +rcpaYield.toFixed(2),
    missedPostedDays: delay.locks.length, missedReleaseDays: delay.locks.filter((l) => l.releasedAt).length,
    missedCompletedDays: delay.delayedDates.filter((d) => d.kind === "late-submitted").length,
    delayedDays: delay.delayedDates.length, delayedTotalDays: delay.total,
    hqAmountRs: expenseSplit.hq, exAmountRs: expenseSplit.ex, osAmountRs: expenseSplit.os,
    sampleSpentRs: spend.sample, inputSpentRs: spend.input, drServiceSpentRs: spend.drService,
    chemistPobCount: (chemistCalls as any[]).filter((c) => hasPob(c)).length,
    chemistPobValue: +(chemistCalls as any[]).reduce((sum, c) => sum + docPobValue(c, rates), 0).toFixed(2),
    doctorPobValue: +(dcrs as any[]).reduce((sum, d) => sum + docPobValue(d, rates), 0).toFixed(2),
    // Growth = primary sale vs the previous month's primary sale for the HQ.
    growth: prevPrimary > 0 ? +(((primarySale - prevPrimary) / prevPrimary) * 100).toFixed(1) : 0,
    clEligibility: Number(ent.cl || 0), plEligibility: Number(ent.pl || 0), slEligibility: Number(ent.sl || 0), lopEligibility: Number(ent.lop || 0)
  };

  return {
    // Working Info
    daysInMonth: numDays, fwDays, nfwDays: numDays - fwDays, leave: leaveDaysCount, holidaySunday,
    // Master Info
    totalDoctorsInList, totalChemistInList, totalUnlistedDrsInList, totalStockistInList, totalHospitalInList,
    // Listed Dr Info
    listedDrsMet, listedDrsSeen, lstDrCoveragePct, lstDrCallAverage, lstDrMissedCall,
    // Chemists Info
    chemistsMet, chemistsSeen, chemCoveragePct, chemCallAverage, chemMissedChemist,
    // Round 37 Item 2 -- Call Type
    hqDays: hqWorked, hqList: totalDoctorsInList, hqMet: hqMetSet.size, hqSeen: hqMetSet.size, hqCoveragePct: covPct(hqMetSet.size),
    exDays: exWorked, exList: totalDoctorsInList, exMet: exMetSet.size, exSeen: exMetSet.size, exCoveragePct: covPct(exMetSet.size),
    osDays: osWorked, osList: totalDoctorsInList, osMet: osMetSet.size, osSeen: osMetSet.size, osCoveragePct: covPct(osMetSet.size),
    morningCalls, eveningCalls,
    // Round 37 Item 2 -- Class wise (Nil tier always 0 -- see comment above)
    classNilList: 0, classNilMet: 0, classNilSeen: 0, classNilCoverage: 0,
    classAList: classListByTier.A, classAMet: classMetByTier.A.size, classASeen: classMetByTier.A.size, classACoverage: classCoverage("A"),
    classBList: classListByTier.B, classBMet: classMetByTier.B.size, classBSeen: classMetByTier.B.size, classBCoverage: classCoverage("B"),
    classCList: classListByTier.C, classCMet: classMetByTier.C.size, classCSeen: classMetByTier.C.size, classCCoverage: classCoverage("C"),
    // Round 37 Item 2 -- Speciality Analysis (real); Campaign Info has no
    // real per-visit campaign-attendance link anywhere in this schema.
    specialityList, specialityMet, specialitySeen, specialityMissed,
    campaignList: 0, campaignMet: 0, campaignSeen: 0, campaignMissed: 0,
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
    quizRaised: quizzesRaised, quizAttended, quizTotalQuestions, quizMarksObtained, quizPercentage,
    // Round 41 extras (override the older placeholders above)
    ...extra
  };
}
