export type ZiviraTreeNode = {
  title: string;
  slug: string;
  scope: "auth" | "main" | "division" | "communication" | "utilities";
  children?: ZiviraTreeNode[];
};

export type ZiviraTreeFlatNode = ZiviraTreeNode & {
  path: string[];
};

const node = (
  title: string,
  slug: string,
  scope: ZiviraTreeNode["scope"],
  children?: ZiviraTreeNode[]
): ZiviraTreeNode => ({ title, slug, scope, children });

export const ziviraApplicationTree: ZiviraTreeNode[] = [
  node("Authentication Layer", "authentication-layer", "auth", [
    node("Login Portal", "login-portal", "auth", [
      node("URL - sanpharma.info/Index.aspx", "login-url", "auth"),
      node("Username Field", "username-field", "auth"),
      node("Password Field", "password-field", "auth"),
      node("Login Button", "login-button", "auth"),
      node("User Authentication / Session Creation", "session-creation", "auth")
    ]),
    node("Access Control", "access-control", "auth", [
      node("Credential Validation", "credential-validation", "auth"),
      node("User Session Handling", "session-handling", "auth"),
      node("Redirect to Dashboard", "redirect-dashboard", "auth")
    ])
  ]),
  node("Main Dashboard", "main-dashboard", "main", [
    node("URL - sanpharma.info/Default.aspx", "main-dashboard-url", "main"),
    node("Welcome Corporate HQ", "welcome-corporate-hq", "main"),
    node("Support Portal", "support-portal", "main"),
    node("Division Selection", "division-selection", "main", [
      node("Zivira Labs Pvt Ltd", "zivira-labs-pvt-ltd", "main"),
      node("Enter", "enter", "main"),
      node("Enter W/O Dashboard", "enter-without-dashboard", "main")
    ]),
    node("Main Panel", "main-panel", "main", [
      node("---No Mails Received---", "no-mails-received", "main"),
      node("License Key", "license-key", "main"),
      node("Click here to View Doctor's DOB and DOW", "doctor-dob-dow", "main"),
      node("Delayed Report Status", "delayed-report-status", "main"),
      node("Notice Board", "notice-board", "main"),
      node("Have a great day", "have-a-great-day", "main")
    ]),
    node("Flash News", "flash-news", "main", [node("Talk To Us", "talk-to-us", "main")]),
    node("Navigation Tabs", "main-navigation-tabs", "main", [
      node("Home", "home", "main"),
      node("Master", "main-master", "main", [
        node("Division", "division", "main"),
        node("Designation", "designation", "main"),
        node("Holiday Master", "holiday-master", "main"),
        node("Change Password", "change-password", "main"),
        node("HO ID Creation", "ho-id-creation", "main"),
        node("Statewise Weekoff Fixation", "statewise-weekoff-fixation", "main"),
        node("Menu Rights", "menu-rights", "main")
      ]),
      node("Reports", "main-reports", "main", [
        node("User List", "user-list", "main"),
        node("Doctor Details", "doctor-details", "main", [node("View", "view", "main")]),
        node("Fieldforce Status", "fieldforce-status", "main"),
        node("Call Average View", "call-average-view", "main"),
        node("Work Type View Status", "work-type-view-status", "main"),
        node("DCR Count View", "dcr-count-view", "main"),
        node("DCR Count View - State Wise", "dcr-count-view-state-wise", "main"),
        node("Hold / Blocked Id's", "hold-blocked-ids", "main", [node("View", "view", "main")]),
        node("App Version View", "app-version-view", "main")
      ]),
      node("Options", "main-options", "main", [
        node("Status View", "status-view", "main"),
        node("Not Submitted Status", "not-submitted-status", "main"),
        node("State View", "state-view", "main")
      ]),
      node("Dash Board", "main-dash-board", "main", [node("App Usage", "app-usage", "main")]),
      node("Logout", "logout", "main", [
        node("Session Termination", "session-termination", "main"),
        node("Redirect to Login", "redirect-to-login", "main")
      ])
    ])
  ]),
  node("Division Dashboard", "division-dashboard", "division", [
    node("Dashboard Filters", "dashboard-filters", "division", [
      node("FieldForce Name", "fieldforce-name", "division"),
      node("Month", "month", "division"),
      node("Year", "year", "division"),
      node("View", "view", "division")
    ]),
    node("DASH BOARD", "dash-board", "division", [
      node("Field Work Days", "field-work-days", "division"),
      node("Call Average", "call-average", "division"),
      node("Call Adherence", "call-adherence", "division"),
      node("Product Detailed Drs", "product-detailed-drs", "division"),
      node("Visit Calls (Team)", "visit-calls-team", "division")
    ]),
    node("Navigation Tabs", "division-navigation-tabs", "division", [
      node("Home", "home", "division"),
      node("Master", "division-master", "division", [
        node("SubDivision", "subdivision", "division", [
          node("Entry", "entry", "division"),
          node("View - Productwise", "view-productwise", "division"),
          node("View - Field Forcewise", "view-field-forcewise", "division")
        ]),
        node("Product", "product", "division", [
          node("Category", "category", "division"),
          node("Group", "group", "division"),
          node("Brand", "brand", "division"),
          node("Product Detail", "product-detail", "division"),
          node("Statewise - Rate Fixation", "statewise-rate-fixation", "division"),
          node("Statewise - Product Rate - View", "statewise-product-rate-view", "division"),
          node("Scheme", "scheme", "division")
        ]),
        node("Field Force", "field-force", "division"),
        node("Doctor", "doctor", "division", [
          node("Category", "category", "division"),
          node("Speciality", "speciality", "division"),
          node("Class", "class", "division"),
          node("Campaign", "campaign", "division"),
          node("Qualification", "qualification", "division"),
          node("Chemists Category", "chemists-category", "division"),
          node("Chemists Class", "chemists-class", "division")
        ]),
        node("Input", "input", "division"),
        node("Field Force Entries", "field-force-entries", "division", [
          node("Territory", "territory", "division"),
          node("Territory - Listed Doctor", "territory-listed-doctor", "division"),
          node("Territory Bulk Deactivation", "territory-bulk-deactivation", "division"),
          node("Listed Doctor", "listed-doctor", "division"),
          node("Chemist", "chemist", "division"),
          node("Hospital", "hospital", "division"),
          node("Unlisted Doctor", "unlisted-doctor", "division"),
          node("TerritoryWise Lat/Long", "territorywise-lat-long", "division")
        ]),
        node("Statewise - Holiday Fixation", "statewise-holiday-fixation", "division", [
          node("Entry", "entry", "division"),
          node("View", "view", "division")
        ]),
        node("Stockist Details", "stockist-details", "division", [
          node("Add/Edit/DeActivate", "add-edit-deactivate", "division"),
          node("Stockist View", "stockist-view", "division"),
          node("Entry Status I", "entry-status-i", "division"),
          node("Entry Status II", "entry-status-ii", "division"),
          node("Stockist - HQ Creation", "stockist-hq-creation", "division"),
          node("Stockist - HQ Updation", "stockist-hq-updation", "division"),
          node("Statewise - Entry Status", "statewise-entry-status", "division"),
          node("Super Stockist - Create & Map", "super-stockist-create-map", "division")
        ]),
        node("Expense", "expense", "division", [
          node("SFC Updation", "sfc-updation", "division"),
          node("SFC View", "sfc-view", "division"),
          node("Allowance Fixation", "allowance-fixation", "division"),
          node("Wrk Type Wise - Allowance Fix", "wrk-type-wise-allowance-fix", "division"),
          node("Fixed/Variable Expense Parameter", "fixed-variable-expense-parameter", "division"),
          node("Expense Setup", "expense-setup", "division")
        ]),
        node("Manager Expense", "manager-expense", "division", [
          node("Allowance Fixation (Automatic)", "allowance-fixation-automatic", "division"),
          node("SFC Updation", "sfc-updation", "division"),
          node("Wrk Type Wise - Allowance Fix", "wrk-type-wise-allowance-fix", "division")
        ]),
        node("Personal Information", "personal-information", "division", [
          node("Personal - Entry", "personal-entry", "division"),
          node("Personal - View", "personal-view", "division")
        ])
      ]),
      node("Activities", "activities", "division", [
        node("Approvals", "approvals", "division", [
          node("Listed Dr Addition", "listed-dr-addition", "division"),
          node("Listed Dr Deactivation", "listed-dr-deactivation", "division"),
          node("TP", "tp", "division"),
          node("DCR", "dcr", "division"),
          node("Leave", "leave", "division"),
          node("Order Booking Approval", "order-booking-approval", "division")
        ]),
        node("Expense", "expense", "division", [
          node("Approval(Active)", "approval-active", "division"),
          node("Approval(Vacant/Resigned)", "approval-vacant-resigned", "division"),
          node("Analysis", "analysis", "division"),
          node("Consolidated View", "consolidated-view", "division")
        ]),
        node("Chemist Business Valuewise", "chemist-business-valuewise", "division"),
        node("Sample Despatch", "sample-despatch", "division", [node("View", "view", "division"), node("Status", "status", "division")]),
        node("Input Despatch", "input-despatch", "division", [node("View", "view", "division"), node("Status", "status", "division")]),
        node("MSIS", "msis", "division", [node("View", "view", "division")]),
        node("Leave Entitlement", "leave-entitlement", "division", [node("Entry", "entry", "division"), node("View", "view", "division")]),
        node("Audit Report", "audit-report", "division"),
        node("Login Details", "login-details", "division"),
        node("Login Into Fieldforce", "login-into-fieldforce", "division"),
        node("Task Management", "task-management", "division", [node("Mode Creation", "mode-creation", "division"), node("Task Assign", "task-assign", "division")]),
        node("Order Booking View", "order-booking-view", "division"),
        node("Activity", "activity", "division", [node("Master & Screen Creation", "master-screen-creation", "division"), node("Status", "status", "division")]),
        node("Manager Missed Call", "manager-missed-call", "division", [node("Setup", "setup", "division"), node("View", "view", "division")])
      ]),
      node("Activity Reports", "activity-reports", "division", [
        node("Territory", "territory", "division", [node("View", "view", "division"), node("Status", "status", "division")]),
        node("Survey", "survey", "division", [node("Question Creation", "question-creation", "division"), node("Updation", "updation", "division"), node("View", "view", "division")]),
        node("TP", "tp", "division", [node("Consolidated View", "consolidated-view", "division"), node("View", "view", "division"), node("Status", "status", "division"), node("Datewise", "datewise", "division")]),
        node("DCR", "dcr", "division", [node("View", "view", "division"), node("Status", "status", "division"), node("Not Approved", "not-approved", "division"), node("Not Submitted", "not-submitted", "division"), node("Count - ModeWise", "count-modewise", "division"), node("Approve/Reject", "approve-reject", "division"), node("Time Status", "time-status", "division"), node("Checkin-Checkout", "checkin-checkout", "division")]),
        node("Customized Report", "customized-report", "division")
      ]),
      node("MIS Reports", "mis-reports", "division", [
        node("Manager Analysis", "manager-analysis", "division", [node("HQ - Coveragewise", "hq-coveragewise", "division"), node("Coverage Analysis 1", "coverage-analysis-1", "division"), node("Joint Workwise", "joint-workwise", "division"), node("FieldWork Manager - Analysis", "fieldwork-manager-analysis", "division"), node("Coverage Analysis(Mgr)", "coverage-analysis-mgr", "division"), node("Speciality/Category Visit Wise", "speciality-category-visit-wise", "division")]),
        node("Analysis", "analysis", "division", [node("DCR", "dcr", "division"), node("Visit Analysis", "visit-analysis", "division"), node("Sales Details", "sales-details", "division"), node("POB Wise", "pob-wise", "division"), node("POB Wise - Periodically", "pob-wise-periodically", "division"), node("Work Hygiene Report", "work-hygiene-report", "division"), node("Class Wise View", "class-wise-view", "division"), node("DCR Analysis Dump", "dcr-analysis-dump", "division")]),
        node("Missed Call Report", "missed-call-report", "division"),
        node("Single Analysis", "single-analysis", "division", [node("Doctor - Analysis", "doctor-analysis", "division"), node("Rep Vs Manager", "rep-vs-manager", "division"), node("Review Report", "review-report", "division"), node("Assessment Report", "assessment-report", "division")]),
        node("POB/Rx", "pob-rx", "division", [node("Listed Dr/Chemist(Product Wise)", "listed-dr-chemist-product-wise", "division"), node("Listed Dr/Chemist(Fieldforce Wise)", "listed-dr-chemist-fieldforce-wise", "division"), node("Listed Dr/Chemist(Day Wise)", "listed-dr-chemist-day-wise", "division"), node("Listed Dr/Chemist Dump", "listed-dr-chemist-dump", "division")]),
        node("Heat Analysis", "heat-analysis", "division", [node("Not at all Visited Drs", "not-at-all-visited-drs", "division"), node("Not at all Promoted Products", "not-at-all-promoted-products", "division"), node("Not at all Visited HQs", "not-at-all-visited-hqs", "division")]),
        node("Visit Details", "visit-details", "division", [node("Cat/Cls/Splty/LstDr Wise", "cat-cls-splty-lstdr-wise", "division"), node("Datewise", "datewise", "division"), node("Doctorwise(Periodically)", "doctorwise-periodically", "division"), node("Call Feedbackwise", "call-feedbackwise", "division"), node("Fixationwise(By Visit)", "fixationwise-by-visit", "division"), node("Based on Modewise", "based-on-modewise", "division"), node("at a Glance", "at-a-glance", "division"), node("Manager - Visit(Vacant HQ's)", "manager-visit-vacant-hqs", "division"), node("Chemist & UnListed Doctors", "chemist-unlisted-doctors", "division"), node("Territorywise - Listed Doctor Visit", "territorywise-listed-doctor-visit", "division")]),
        node("Product Exposure", "product-exposure", "division", [node("Analysis", "analysis", "division"), node("Speciality/Category Wise", "speciality-category-wise", "division"), node("ListedDr - Productwise Visit", "listeddr-productwise-visit", "division"), node("Analysis - Unlisted Doctor", "analysis-unlisted-doctor", "division"), node("Priority Wise", "priority-wise", "division")]),
        node("Sample / Input", "sample-input", "division", [node("Sample Issued - Fieldforce Wise", "sample-issued-fieldforce-wise", "division"), node("Input Issued - Fieldforce Wise", "input-issued-fieldforce-wise", "division"), node("Sample Rx Quantity", "sample-rx-quantity", "division")]),
        node("Status", "status", "division", [node("Delayed", "delayed", "division"), node("Leave - Active Fieldforce", "leave-active-fieldforce", "division"), node("Leave - Periodically", "leave-periodically", "division"), node("Mail", "mail", "division")]),
        node("Exception", "exception", "division", [node("Tour Plan - Baselevel", "tour-plan-baselevel", "division"), node("Tour Plan - Managers", "tour-plan-managers", "division"), node("At a Glance", "at-a-glance", "division")]),
        node("Options", "options", "division", [node("Resigned User Status", "resigned-user-status", "division"), node("Join/Left Details", "join-left-details", "division")]),
        node("Dump", "dump", "division", [node("Visit - Drs", "visit-drs", "division"), node("Secondary Sale", "secondary-sale", "division"), node("Listeddr", "listeddr", "division"), node("Chemist", "chemist", "division"), node("Transit Bills", "transit-bills", "division"), node("Listed Stockiest", "listed-stockiest", "division")]),
        node("Dump II", "dump-ii", "division", [node("RCPA", "rcpa", "division")]),
        node("Doctor", "doctor", "division"),
        node("Digital Detailing", "digital-detailing", "division", [node("Visit Wise", "visit-wise", "division"), node("Brand Wise Star Rating", "brand-wise-star-rating", "division"), node("Product Slide Analysis", "product-slide-analysis", "division"), node("Drs Analysis", "drs-analysis", "division")]),
        node("Summary", "summary", "division", [node("Day Wise Reports", "day-wise-reports", "division"), node("Call Report Dump", "call-report-dump", "division")]),
        node("Quiz Test Result", "quiz-test-result", "division")
      ]),
      node("Options", "division-options", "division", [
        node("Dashboard", "dashboard", "division"),
        node("Change Password", "change-password", "division"),
        node("Vacant MR Login", "vacant-mr-login", "division", [node("Access", "access", "division"), node("Permission for Managers", "permission-for-managers", "division")]),
        node("Doctor - Campaign Map", "doctor-campaign-map", "division"),
        node("Update/Delete", "update-delete", "division", [node("TP Delete", "tp-delete", "division"), node("DCR Edit", "dcr-edit", "division"), node("MSIS Edit", "msis-edit", "division"), node("Mail Delete", "mail-delete", "division"), node("Leave Cancellation", "leave-cancellation", "division"), node("Mob App - Device Id Deletion", "mob-app-device-id-deletion", "division"), node("TP Deviation - Release", "tp-deviation-release", "division"), node("Drs UNI No - Generation", "drs-uni-no-generation", "division"), node("Chemist Business - Release", "chemist-business-release", "division"), node("Chem Bus-Month Release", "chem-bus-month-release", "division"), node("Auto Mail Reports", "auto-mail-reports", "division")]),
        node("Basic Setup", "basic-setup", "division", [node("Screen Access Rights", "screen-access-rights", "division"), node("Base Level", "base-level", "division"), node("Managers", "managers", "division"), node("Approval Mandatory", "approval-mandatory", "division"), node("Managerwise Core Doctor Map", "managerwise-core-doctor-map", "division"), node("Screenwise Access", "screenwise-access", "division"), node("Mail Folder Creation", "mail-folder-creation", "division"), node("Other Setup", "other-setup", "division"), node("Homepage Dashboard Display", "homepage-dashboard-display", "division"), node("Leave Setup", "leave-setup", "division"), node("Leave Policy Setup", "leave-policy-setup", "division"), node("Device Lock", "device-lock", "division"), node("Order Booking Setup", "order-booking-setup", "division")]),
        node("App Setup", "app-setup", "division", [node("Call Feedback", "call-feedback", "division"), node("Call Remarks Templates", "call-remarks-templates", "division"), node("Notification Message", "notification-message", "division"), node("Gps/Geofence & Tagg Deletion", "gps-geofence-tagg-deletion", "division"), node("Dynamic App Link", "dynamic-app-link", "division")]),
        node("Mail Box", "mail-box", "division"),
        node("Customer Upload", "customer-upload", "division", [node("Listed Doctor", "listed-doctor", "division"), node("Chemist", "chemist", "division"), node("Sample", "sample", "division"), node("Input", "input", "division"), node("Target", "target", "division")]),
        node("Information Upload", "information-upload", "division", [node("Flash News", "flash-news", "division"), node("Notice Board", "notice-board", "division"), node("Quote for the Week", "quote-for-the-week", "division"), node("Talk to Us", "talk-to-us", "division"), node("File/Circular (Desig.Wise)", "file-circular-desig-wise", "division"), node("User Manual Upload", "user-manual-upload", "division")]),
        node("Upload", "upload", "division", [node("Field Force", "field-force", "division"), node("Stockist", "stockist", "division"), node("Product", "product", "division"), node("Product Rate", "product-rate", "division"), node("Slides Upload", "slides-upload", "division"), node("Holiday Fixation", "holiday-fixation", "division"), node("Leave-Bulk Upload", "leave-bulk-upload", "division")]),
        node("Transaction Upload", "transaction-upload", "division"),
        node("Image Upload", "image-upload", "division", [node("Home Page(Common For All)", "home-page-common-for-all", "division"), node("Home Page(FieldForcewise)", "home-page-fieldforcewise", "division")]),
        node("Leave Status", "leave-status", "division"),
        node("Transfers", "transfers", "division", [node("Transfer - Master Details", "transfer-master-details", "division"), node("Convert Unlisted Drs - Listed Drs", "convert-unlisted-drs-listed-drs", "division")]),
        node("Release - Missing Dates / Delay", "release-missing-dates-delay", "division"),
        node("Quiz", "quiz", "division"),
        node("Quiz Category", "quiz-category", "division")
      ]),
      node("Logout", "division-logout", "division", [node("Session Termination", "session-termination", "division"), node("Redirect to Login", "redirect-to-login", "division")])
    ])
  ]),
  node("Notification & Communication Layer", "notification-communication-layer", "communication", [
    node("No Mails Received", "no-mails-received", "communication"),
    node("Notice Board", "notice-board", "communication"),
    node("Flash News", "flash-news", "communication"),
    node("Support Portal", "support-portal", "communication"),
    node("Talk To Us Widget", "talk-to-us-widget", "communication"),
    node("Internal Messaging", "internal-messaging", "communication"),
    node("Mail Box", "mail-box", "communication")
  ]),
  node("System Utilities", "system-utilities", "utilities", [
    ...[
      "Task Status Monitoring",
      "Report Tracking",
      "Dashboard Widgets",
      "User Interaction Panel",
      "Survey Engine",
      "Approval Workflow System",
      "Notification Engine",
      "Geofence & GPS Controls",
      "Device Management",
      "Upload Management",
      "Analytics & MIS Engine",
      "Quiz Management",
      "Role-Based Access Control",
      "Transfer Management",
      "Leave Management",
      "Expense Management",
      "Doctor & Chemist Mapping",
      "Territory Management",
      "Product Exposure Analytics",
      "Order Booking Management"
    ].map((title) => node(title, title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), "utilities"))
  ])
];

export function flattenZiviraTree(nodes = ziviraApplicationTree, parents: string[] = []): ZiviraTreeFlatNode[] {
  return nodes.flatMap((item) => {
    const path = [...parents, item.slug];
    return [{ ...item, path }, ...flattenZiviraTree(item.children ?? [], path)];
  });
}
