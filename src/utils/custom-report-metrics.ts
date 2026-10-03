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
  { category: "Call Type", metrics: [
    { key: "exMet", label: "EX Met" }, { key: "exSeen", label: "EX Seen" },
    { key: "eveningCalls", label: "Evening Calls" }, { key: "bothCalls", label: "Both Calls" },
    { key: "cList", label: "C List" }, { key: "cMet", label: "C Met" }, { key: "cSeen", label: "C Seen" }, { key: "cCoverage", label: "C Coverage" },
    // Two further boxes were visible only as bare "Coverage(%)" labels in
    // the legacy screenshot with no distinguishing text -- kept as
    // generically-named Call Type sub-coverage slots per the coordinator's
    // explicit "group these as best matches" instruction.
    { key: "callTypeCoveragePct1", label: "Coverage(%)" }, { key: "callTypeCoveragePct2", label: "Coverage(%)" }
  ]},
  { category: "Class wise", metrics: [
    // Legacy image was cut off after "Nil List" -- mirrored the Doctor
    // Category Info pattern (Nil/CORE/NON CORE/SUPER CORE List) per the
    // coordinator's explicit fallback instruction. Disclosed assumption.
    { key: "classNilList", label: "Nil List" },
    { key: "classCoreList", label: "CORE List" },
    { key: "classNonCoreList", label: "NON CORE List" },
    { key: "classSuperCoreList", label: "SUPER CORE List" }
  ]},
  { category: "Speciality Analysis", metrics: [{ key: "specialityAnalysis", label: "None selected" }] },
  { category: "Campaign Info", metrics: [{ key: "campaignInfo", label: "None selected" }] },
  { category: "Product Exposure", metrics: [
    { key: "productExposureSelect", label: "None selected" },
    { key: "noOfDetailingDrs", label: "No. of Detailing Drs" },
    { key: "noOfRxDrs", label: "No. of Rx Drs" }
  ]},
  { category: "Brand Exposure", metrics: [
    { key: "brandExposureSelect", label: "None selected" },
    { key: "promotedDrsSelect", label: "Promoted DRs" }
  ]},
  { category: "Core Drs Info", metrics: [
    { key: "coreDrsTagged", label: "Core drs Tagged by Manager" },
    { key: "coreDrsMet", label: "Met" },
    { key: "coreDrsSeen", label: "Seen" },
    { key: "coreDrsMissed", label: "Missed" },
    { key: "coreDrsCoveragePct", label: "Coverage(%)" }
  ]},
  { category: "Call Feedback", metrics: [{ key: "callFeedbackSeen", label: "Seen" }] },
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
export const COMPUTED_METRIC_KEYS = new Set([
  "daysInMonth", "fwDays", "nfwDays", "leave", "holidaySunday",
  "listedDrsMet", "chemistsMet",
  "noOfHqPlanned", "noOfExPlanned", "noOfOsPlanned",
  "actualHqWorked", "actualExWorked", "actualOsWorked"
]);
