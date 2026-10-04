// Round 35 Item 7 -- the full Customized Report Generation metric catalog,
// exactly matching the legacy category boxes/checkbox labels given. Every
// key here is a valid `metrics[]` entry; `computeCustomReportMetrics()`
// below computes the honest REAL subset this schema can actually back
// today -- every other key is still selectable/savable (so Screen A's
// Parameter count is always real) but is reported back from the output
// endpoint as `computed: false` rather than a fabricated number.

export type MetricDef = { key: string; label: string; category: string };

export const CUSTOM_REPORT_CATEGORIES: { category: string; metrics: { key: string; label: string }[] }[] = [
  { category: "Working Info", metrics: [
    { key: "daysInMonth", label: "Days in Month" },
    { key: "fwDays", label: "FW Days" },
    { key: "nfwDays", label: "NFW Days" },
    { key: "leave", label: "Leave" },
    { key: "holidaySunday", label: "Holiday and Sunday" }
  ]},
  { category: "Master Info", metrics: [
    { key: "totalDoctorsInList", label: "Total Doctors in List" },
    { key: "totalChemistInList", label: "Total Chemist in List" },
    { key: "totalUnlistedDrsInList", label: "Total Unlisted Drs in List" },
    { key: "totalStockistInList", label: "Total Stockist in List" },
    { key: "totalHospitalInList", label: "Total Hospital in List" }
  ]},
  { category: "Listed Dr Info", metrics: [
    { key: "listedDrsMet", label: "Listed Drs Met" },
    { key: "listedDrsSeen", label: "Listed Drs Seen" },
    { key: "lstDrCoveragePct", label: "LstDr Coverage(%)" },
    { key: "lstDrCallAverage", label: "LstDr Call Average" },
    { key: "lstDrMissedCall", label: "LstDr Missed Call" }
  ]},
  { category: "Chemists Info", metrics: [
    { key: "chemistsMet", label: "Chemists Met" },
    { key: "chemistsSeen", label: "Chemists Seen" },
    { key: "chemCoveragePct", label: "Chem Coverage(%)" },
    { key: "chemCallAverage", label: "Chem Call Average" },
    { key: "chemMissedChemist", label: "Chem Missed Chemist" }
  ]},
  { category: "Unlisted Drs Info", metrics: [
    { key: "unlistedDrsMet", label: "Unlisted Drs Met" },
    { key: "unlistedDrsSeen", label: "Unlisted Drs Seen" },
    { key: "unlstCoveragePct", label: "Unlst Coverage(%)" },
    { key: "unlstCallAverage", label: "Unlst Call Average" },
    { key: "unlstMissedCall", label: "Unlst Missed Call" }
  ]},
  { category: "Listed Drs + Unlisted Drs", metrics: [
    { key: "listedUnlistedDrsSeen", label: "Listed + Unlisted Drs Seen" },
    { key: "lstUnlstCallAverage", label: "LstUnlst Call Average" },
    { key: "repeatedCallsMet", label: "Repeated Calls Met" },
    { key: "repeatedCoveragePct", label: "Repeated Coverage(%)" }
  ]},
  { category: "Join Work Info", metrics: [
    { key: "jointWorkDays", label: "Joint Work Days" },
    { key: "jointCallsMet", label: "Joint Calls Met" },
    { key: "jointCallsSeen", label: "Joint Calls seen" },
    { key: "jointCallAvg", label: "Joint Call Avg" }
  ]},
  { category: "Category Coverage", metrics: [
    { key: "nilCoveragePct", label: "Nil Coverage(%)" },
    { key: "coreCoveragePct", label: "CORE Coverage(%)" },
    { key: "nonCoreCoveragePct", label: "NON CORE Coverage(%)" },
    { key: "superCoreCoveragePct", label: "SUPER CORE Coverage(%)" }
  ]},
  { category: "Drs Visit", metrics: [
    { key: "visit1Drs", label: "1 Visit Drs" },
    { key: "visit2Drs", label: "2 Visit Drs" },
    { key: "visit3Drs", label: "3 Visit Drs" },
    { key: "visitMoreThan3Drs", label: "More than 3 Visit Drs" },
    { key: "visit1CoveragePct", label: "I Visit Coverage(%)" },
    { key: "visit2CoveragePct", label: "II Visit Coverage(%)" },
    { key: "visit3CoveragePct", label: "III Visit Coverage(%)" },
    { key: "visitMoreThan3CoveragePct", label: "More than III Visit Coverage(%)" }
  ]},
  { category: "Doctor Category Info", metrics: [
    { key: "nilList", label: "Nil List" },
    { key: "coreList", label: "CORE List" },
    { key: "nonCoreList", label: "NON CORE List" },
    { key: "superCoreList", label: "SUPER CORE List" }
  ]},
  { category: "Doctor Category Visit Info", metrics: [
    { key: "nilMet", label: "Nil Met" }, { key: "nilSeen", label: "Nil Seen" },
    { key: "coreMet", label: "CORE Met" }, { key: "coreSeen", label: "CORE Seen" },
    { key: "nonCoreMet", label: "NON CORE Met" }, { key: "nonCoreSeen", label: "NON CORE Seen" },
    { key: "superCoreMet", label: "SUPER CORE Met" }, { key: "superCoreSeen", label: "SUPER CORE Seen" }
  ]},
  { category: "Doctor Category Call Adherance", metrics: [
    { key: "nilMet2x", label: "Nil Met (2 times)" }, { key: "nilAdherCoverage", label: "Nil Coverage" }, { key: "nilMissed", label: "Nil Missed" },
    { key: "coreMet2x", label: "CORE Met (2 times)" }, { key: "coreAdherCoverage", label: "CORE Coverage" }, { key: "coreMissed", label: "CORE Missed" },
    { key: "nonCoreMet2x", label: "NON CORE Met (2 times)" }, { key: "nonCoreAdherCoverage", label: "NON CORE Coverage" }, { key: "nonCoreMissed", label: "NON CORE Missed" },
    // Legacy shows one unlabeled checkbox here -- omitted per the coordinator's instruction.
    { key: "superCoreAdherCoverage", label: "SUPER CORE Coverage" }, { key: "superCoreMissed", label: "SUPER CORE Missed" }
  ]},
  // Round 37 Item 2 -- coordinator re-confirmed the exact legacy Call Type
  // box content precisely: HQ/EX/OS, each with Days/List/Met/Seen/
  // Coverage(%), plus Morning Calls/Evening Calls. Replaces Round 35's
  // smaller best-guess set now that the real content is known.
  { category: "Call Type", metrics: [
    { key: "hqDays", label: "HQ Days" }, { key: "hqList", label: "HQ List" }, { key: "hqMet", label: "HQ Met" }, { key: "hqSeen", label: "HQ Seen" }, { key: "hqCoveragePct", label: "HQ Coverage(%)" },
    { key: "exDays", label: "EX Days" }, { key: "exList", label: "EX List" }, { key: "exMet", label: "EX Met" }, { key: "exSeen", label: "EX Seen" }, { key: "exCoveragePct", label: "EX Coverage(%)" },
    { key: "osDays", label: "OS Days" }, { key: "osList", label: "OS List" }, { key: "osMet", label: "OS Met" }, { key: "osSeen", label: "OS Seen" }, { key: "osCoveragePct", label: "OS Coverage(%)" },
    { key: "morningCalls", label: "Morning Calls" }, { key: "eveningCalls", label: "Evening Calls" }
  ]},
  // Round 37 Item 2 -- coordinator re-confirmed Class wise is the
  // Nil/A/B/C 4-tier scheme (same shape as Doctor Category Info, but
  // keyed to DoctorModel.category A/B/C + Nil rather than the CORE/NON
  // CORE/SUPER CORE scheme) -- List/Met/Seen/Coverage per tier.
  { category: "Class wise", metrics: [
    { key: "classNilList", label: "Nil List" }, { key: "classNilMet", label: "Nil Met" }, { key: "classNilSeen", label: "Nil Seen" }, { key: "classNilCoverage", label: "Nil Coverage" },
    { key: "classAList", label: "A List" }, { key: "classAMet", label: "A Met" }, { key: "classASeen", label: "A Seen" }, { key: "classACoverage", label: "A Coverage" },
    { key: "classBList", label: "B List" }, { key: "classBMet", label: "B Met" }, { key: "classBSeen", label: "B Seen" }, { key: "classBCoverage", label: "B Coverage" },
    { key: "classCList", label: "C List" }, { key: "classCMet", label: "C Met" }, { key: "classCSeen", label: "C Seen" }, { key: "classCCoverage", label: "C Coverage" }
  ]},
  // Round 37 Item 2 -- List/Met/Seen/Missed checkboxes below each
  // multi-select, per the coordinator's exact spec.
  { category: "Speciality Analysis", metrics: [
    { key: "specialityList", label: "List" }, { key: "specialityMet", label: "Met" }, { key: "specialitySeen", label: "Seen" }, { key: "specialityMissed", label: "Missed" }
  ]},
  { category: "Campaign Info", metrics: [
    { key: "campaignList", label: "List" }, { key: "campaignMet", label: "Met" }, { key: "campaignSeen", label: "Seen" }, { key: "campaignMissed", label: "Missed" }
  ]},
  { category: "Product Exposure", metrics: [
    { key: "noOfDetailingDrs", label: "No. of Detailing Drs" },
    { key: "noOfRxDrs", label: "No. of Rx Drs" }
  ]},
  { category: "Brand Exposure", metrics: [
    { key: "promotedDrsSelect", label: "Promoted DRs" }
  ]},
  { category: "Core Drs Info", metrics: [
    { key: "coreDrsTagged", label: "Core drs Tagged by Manager" },
    { key: "coreDrsMet", label: "Met" },
    { key: "coreDrsSeen", label: "Seen" },
    { key: "coreDrsMissed", label: "Missed" },
    { key: "coreDrsCoveragePct", label: "Coverage(%)" }
  ]},
  { category: "Call Feedback", metrics: [{ key: "callFeedbackSeen", label: "Seen" }] }, // multi-select of real products above; this is the one checkbox below it
  { category: "Sample/Input Info", metrics: [
    { key: "sampleGivenDrs", label: "Sample Given DRs" },
    { key: "sampleGivenProducts", label: "Sample Given Products" },
    { key: "sampleGivenQty", label: "Sample Given Qty" },
    { key: "inputGivenDrs", label: "Input Given DRs" },
    { key: "inputGivenProducts", label: "Input Given Products" },
    { key: "inputGivenQty", label: "Input Given Qty" }
  ]},
  { category: "Tour Plan Info", metrics: [
    { key: "noOfHqPlanned", label: "No.of HQ Planned" },
    { key: "noOfExPlanned", label: "No.of EX Planned" },
    { key: "noOfOsPlanned", label: "No.of OS Planned" },
    { key: "actualHqWorked", label: "Actual HQ Worked" },
    { key: "actualExWorked", label: "Actual EX Worked" },
    { key: "actualOsWorked", label: "Actual OS Worked" },
    { key: "noOfTpDeviationDays", label: "No.of TP Deviation Days" }
  ]},
  { category: "Expense Info", metrics: [
    { key: "hqAmountRs", label: "HQ Amount (in Rs.)" },
    { key: "exAmountRs", label: "EX Amount (in Rs.)" },
    { key: "osAmountRs", label: "OS Amount (in Rs.)" },
    { key: "exFareKms", label: "EX Fare (in kms)" },
    { key: "osFareKms", label: "OS Fare (in kms)" },
    { key: "fixedExpenses", label: "Fixed Expenses" },
    { key: "miscellaneous", label: "Miscellaneous" },
    { key: "totalAmount", label: "Total Amount" }
  ]},
  { category: "Leave Info", metrics: [
    { key: "clEligibility", label: "CL Eligibility" }, { key: "plEligibility", label: "PL Eligibility" },
    { key: "slEligibility", label: "SL Eligibility" }, { key: "lopEligibility", label: "LOP Eligibility" },
    { key: "clTaken", label: "CL Taken" }, { key: "plTaken", label: "PL Taken" },
    { key: "slTaken", label: "SL Taken" }, { key: "lopTaken", label: "LOP Taken" }
  ]},
  { category: "Target Info", metrics: [
    { key: "target", label: "Target" }, { key: "primarySale", label: "Primary Sale" },
    { key: "secondarySale", label: "Secondary Sale" }, { key: "achievement", label: "Achievement" }, { key: "growth", label: "Growth" }
  ]},
  { category: "Missed Date Info", metrics: [
    { key: "missedPostedDays", label: "Missed Posted Days" },
    { key: "missedReleaseDays", label: "Missed Release Days" },
    { key: "missedCompletedDays", label: "Missed Completed Days" }
  ]},
  { category: "RCPA", metrics: [
    { key: "rcpaDrsCount", label: "RCPA Drs Count" },
    { key: "totalPotentialRs", label: "Total Potential (in Rs.)" },
    { key: "yieldRs", label: "Yield (in Rs.)" }
  ]},
  { category: "Online Quiz", metrics: [
    { key: "quizRaised", label: "No. of Quiz Raised" },
    { key: "quizAttended", label: "No. of Quiz Attended" },
    { key: "quizTotalQuestions", label: "No. of Total Questions" },
    { key: "quizMarksObtained", label: "Marks Obtained" },
    { key: "quizPercentage", label: "Percentage" }
  ]}
];

export const ALL_METRIC_KEYS = new Set(
  CUSTOM_REPORT_CATEGORIES.flatMap((c) => c.metrics.map((m) => m.key))
);

// The subset this schema can honestly compute today from real data already
// built in Round 34/35 (day-status.ts, TourPlanModel, DcrModel,
// ChemistCallModel). Every other selected metric key is echoed back in the
// output with `computed: false` and `value: null` rather than a fabricated
// number.
// Round 36 Item 1 -- expanded from Round 35's starter set now that
// custom-report-compute.ts backs every one of these with real data (see
// that file's own header comment for exactly which categories still have
// no real backing anywhere in this schema and were deliberately left out).
export const COMPUTED_METRIC_KEYS = new Set([
  // Working Info
  "daysInMonth", "fwDays", "nfwDays", "leave", "holidaySunday",
  // Master Info
  "totalDoctorsInList", "totalChemistInList", "totalUnlistedDrsInList", "totalStockistInList", "totalHospitalInList",
  // Listed Dr Info
  "listedDrsMet", "listedDrsSeen", "lstDrCoveragePct", "lstDrCallAverage", "lstDrMissedCall",
  // Chemists Info
  "chemistsMet", "chemistsSeen", "chemCoveragePct", "chemCallAverage", "chemMissedChemist",
  // Round 37 Item 2 -- Call Type (real)
  "hqDays", "hqList", "hqMet", "hqSeen", "hqCoveragePct",
  "exDays", "exList", "exMet", "exSeen", "exCoveragePct",
  "osDays", "osList", "osMet", "osSeen", "osCoveragePct",
  "morningCalls", "eveningCalls",
  // Round 37 Item 2 -- Class wise (real for A/B/C; Nil always 0 -- no
  // distinct "unclassified" state exists in DoctorModel.category)
  "classNilList", "classNilMet", "classNilSeen", "classNilCoverage",
  "classAList", "classAMet", "classASeen", "classACoverage",
  "classBList", "classBMet", "classBSeen", "classBCoverage",
  "classCList", "classCMet", "classCSeen", "classCCoverage",
  // Round 37 Item 2 -- Speciality Analysis (real); Campaign Info is not
  // computed (no real per-visit campaign-attendance schema exists), left
  // out of this set so it is honestly reported as not-yet-computed.
  "specialityList", "specialityMet", "specialitySeen", "specialityMissed",
  // Drs Visit
  "visit1Drs", "visit2Drs", "visit3Drs", "visitMoreThan3Drs",
  "visit1CoveragePct", "visit2CoveragePct", "visit3CoveragePct", "visitMoreThan3CoveragePct",
  // Join Work Info
  "jointWorkDays", "jointCallsMet", "jointCallsSeen", "jointCallAvg",
  // Sample/Input Info
  "sampleGivenDrs", "sampleGivenProducts", "sampleGivenQty", "inputGivenDrs", "inputGivenProducts", "inputGivenQty",
  // Tour Plan Info
  "noOfHqPlanned", "noOfExPlanned", "noOfOsPlanned",
  "actualHqWorked", "actualExWorked", "actualOsWorked", "noOfTpDeviationDays",
  // Core Drs Info
  "coreDrsTagged", "coreDrsMet", "coreDrsSeen", "coreDrsMissed", "coreDrsCoveragePct",
  // Expense Info (partial -- see custom-report-compute.ts: no HQ/EX/OS
  // split or km field exists, so only these two are real)
  "totalAmount", "miscellaneous",
  // Leave Info (partial -- Taken counts only; no eligibility/balance
  // schema exists anywhere in this codebase)
  "clTaken", "plTaken", "slTaken", "lopTaken",
  // Target Info (partial -- Growth needs a defined prior-period baseline
  // this round did not assume; Target/Primary/Secondary Sale/Achievement
  // are real)
  "target", "primarySale", "secondarySale", "achievement",
  // Online Quiz
  "quizRaised", "quizAttended", "quizTotalQuestions", "quizMarksObtained", "quizPercentage",
  // Round 41 -- now real: 4-tier doctor category, unlisted drs, campaign,
  // product exposure, RCPA, missed dates (DCR locks), expense split,
  // growth and leave eligibility.
  "nilList", "coreList", "nonCoreList", "superCoreList",
  "nilMet", "nilSeen", "coreMet", "coreSeen", "nonCoreMet", "nonCoreSeen", "superCoreMet", "superCoreSeen",
  "nilCoveragePct", "coreCoveragePct", "nonCoreCoveragePct", "superCoreCoveragePct",
  "nilMet2x", "nilAdherCoverage", "nilMissed", "coreMet2x", "coreAdherCoverage", "coreMissed",
  "nonCoreMet2x", "nonCoreAdherCoverage", "nonCoreMissed", "superCoreAdherCoverage", "superCoreMissed",
  "unlistedDrsMet", "unlistedDrsSeen", "unlstCoveragePct", "unlstCallAverage", "unlstMissedCall",
  "listedUnlistedDrsSeen", "lstUnlstCallAverage", "repeatedCallsMet", "repeatedCoveragePct",
  "campaignList", "campaignMet", "campaignSeen", "campaignMissed",
  "noOfDetailingDrs", "noOfRxDrs", "callFeedbackSeen",
  "rcpaDrsCount", "totalPotentialRs", "yieldRs",
  "missedPostedDays", "missedReleaseDays", "missedCompletedDays",
  "hqAmountRs", "exAmountRs", "osAmountRs", "growth",
  // Round 45 -- fare kms (ExpenseClaim.distanceKms), fixed expense master, promoted doctors
  "exFareKms", "osFareKms", "fixedExpenses", "promotedDrsSelect",
  "clEligibility", "plEligibility", "slEligibility", "lopEligibility"
]);
