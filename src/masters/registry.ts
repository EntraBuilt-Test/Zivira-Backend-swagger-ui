/**
 * Single source of truth for every "document master" — the 40 master/sub-tab
 * tables defined in the Zivira Technical Report (Division, Region/Zone,
 * Territory/HQ, Therapy → Molecule → Brand → Product → Rate, Field Force,
 * Doctor's 7 sub-tabs, Input, Patch Name, Attendance, Holiday, Stockist's
 * 8 sub-tabs, Expense Setup, Manager Expense, Personal Information).
 *
 * This is intentionally independent of the older per-master Mongoose models
 * (SubdivisionModel, ProductCategoryModel, etc.) — those stay as-is for the
 * screens already wired to them. Everything here is served through one
 * generic collection-per-key store (see master-record.model.ts) so the
 * backend doesn't need 40 near-identical model files.
 *
 * `key` doubles as the MongoDB collection name.
 * `label` is a field's exact header text from the document.
 * `keyFields` are the field(s) that make a record unique per tenant —
 * used by the API to upsert safely and reject duplicates.
 *
 * Dropdown wiring: a field is either a plain input, a fixed-choice dropdown
 * (`options`), or a live dropdown sourced from another master's current data
 * (`sourceMaster` + `sourceField`) — e.g. a Brand's Division dropdown always
 * reflects whatever divisions currently exist in Division Master, so adding
 * a division there immediately shows up everywhere it's referenced.
 */

export type MasterField = {
  key: string; // camelCase field name stored in Mongo / sent over the API
  label: string; // exact header text from the document
  type?: "string" | "number" | "date";
  options?: string[];
  sourceMaster?: string;
  sourceField?: string;
  // Derived, read-only display field — e.g. showing a Doctor's Name next to
  // the Doctor Code the user actually picks. Computed client-side by looking
  // up `sourceMaster` for a record where `lookupField` equals the current
  // value of `fromField`, then displaying that record's `displayField`.
  computed?: { fromField: string; sourceMaster: string; lookupField: string; displayField: string };
  // Approval-queue screens: sanpharma.info's own pending-request list only
  // shows a few identifying columns (SF Name / HQ / Designation) -- the
  // rest of a request's detail only appears once the admin actually opens
  // "Click Here to Approve". A field marked `detailOnly` is still part of
  // the record (and still shown in the Add Request / Edit modal), but is
  // left out of the outer approval-queue table and shown only inside the
  // per-request detail popup.
  detailOnly?: boolean;
};

export type MasterConfig = {
  key: string; // collection name
  title: string; // human title shown in the admin UI
  // Optional UI hint for screens that need a non-tabular shape: "approvalQueue"
  // renders a pending-request list with a "Click Here to Approve" action
  // (matching sanpharma.info's Approvals screens exactly); "reportFilter"
  // renders Field Force Name / Month / Year dropdown filters above the
  // results table (matching sanpharma.info's report screens). Omitted/
  // "table" keeps the existing generic Add/Edit/Deactivate console.
  uiKind?: "table" | "approvalQueue" | "reportFilter" | "changePassword" | "vacantMrLogin" | "notificationSend" | "upload";
  fields: MasterField[];
  keyFields: string[]; // natural unique key (besides tenantSlug) — used for upsert/update matching
  // Additional fields (besides keyFields) that must also be unique per tenant,
  // e.g. Doctor Name — two doctors can't share a name even though their
  // Doctor Codes differ.
  uniqueFields?: string[];
  // Exact literal text overrides for an "approvalQueue" screen's action
  // column, since sanpharma.info doesn't use identical wording across every
  // Approvals screen (Listed Dr / Leave say "Click Here" / "Click Here to
  // Approve"; DCR's header is "Approve" and its link text carries a live
  // month/year suffix). Omitted defaults to "Click Here" / "Click Here to
  // Approve", matching the Listed Dr / Leave screens.
  approvalActionColumnLabel?: string;
  approvalLinkText?: string;
  approvalLinkDateSuffix?: boolean;
};

const ACTIVE_INACTIVE = ["Active", "Inactive"];

const INDIAN_STATES = [
  "Tamil Nadu", "Kerala", "Karnataka", "Andhra Pradesh", "Telangana", "Maharashtra",
  "Delhi", "West Bengal", "Gujarat", "Punjab", "All States"
];

export const MASTERS: MasterConfig[] = [
  {
    key: "divisionMaster",
    title: "Division Master",
    keyFields: ["divisionCode"],
    fields: [
      { key: "divisionCode", label: "Division Code" },
      { key: "divisionName", label: "Division Name", options: ["Astra", "Aura", "Zivira"] },
      { key: "divisionShortName", label: "Division Short Name", options: ["AST", "AUR", "ZIV"] },
      { key: "description", label: "Description" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "regionZoneMaster",
    title: "Region / Zone Master",
    keyFields: ["regionCode"],
    fields: [
      { key: "zoneName", label: "Zone Name", options: ["North", "South", "East", "West"] },
      { key: "regionName", label: "Region Name" },
      { key: "regionCode", label: "Region Code" },
      // Client screenshot: Regional Zone Master's grid header shows a
      // "Territory Code" column that the frontend was faking client-side
      // (pushed into the schema in generic-master-table.tsx, never sent to
      // or stored by the API) — it always rendered empty and un-editable.
      // Declaring it here makes it a real field: it round-trips through
      // GET/POST/PUT like every other field and is actually persisted in
      // MongoDB.
      { key: "territoryCode", label: "Territory Code", type: "string" },
      { key: "state", label: "State", options: INDIAN_STATES },
      // Zivira_Master_Client_Change_Requirement_3A.docx — "the same
      // geographical name can exist under different divisions" (e.g. two
      // divisions both running a Chennai-area zone). Without this, nothing
      // recorded which division a zone belongs to, so it was effectively
      // one shared zone list no matter how many divisions used it.
      { key: "division", label: "Division", sourceMaster: "divisionMaster", sourceField: "divisionName" },
      { key: "manager", label: "Manager", sourceMaster: "employees", sourceField: "name" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "territoryHqMaster",
    title: "Territory / Headquarters Master",
    keyFields: ["hqCode"],
    fields: [
      { key: "hqCode", label: "HQ Code" },
      { key: "headquartersName", label: "Headquarters Name" },
      // Zivira_Master_Client_Change_Requirement_3A.docx — "take the
      // territory name, not the headquarters name... the headquarters can
      // change depending on the division... Division + Territory ->
      // Headquarters, rather than Territory -> Headquarters." Recording the
      // division on the HQ record itself is what makes that hold — the same
      // territory can now have a different HQ record per division instead
      // of one HQ being silently treated as universal.
      { key: "division", label: "Division", sourceMaster: "divisionMaster", sourceField: "divisionName" },
      { key: "state", label: "State", options: INDIAN_STATES },
      { key: "city", label: "City" },
      { key: "metroNonMetro", label: "Metro / Non-Metro", options: ["Metro", "Non-Metro"] },
      { key: "zone", label: "Zone", sourceMaster: "regionZoneMaster", sourceField: "zoneName" },
      { key: "region", label: "Region", sourceMaster: "regionZoneMaster", sourceField: "regionName" },
      { key: "patchName", label: "Patch Name" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  // Zivira_Master_Tab_Client_Change_3B.docx §9 — "Area Master" is diagrammed
  // as its own master (sibling of Division/Zone/Region/HQ Master) that
  // "provides data to" the Area dropdown field used across Target / Primary
  // Sales / Secondary Sales / Claims / IMS. Not exposed as its own admin
  // tab (Task 3's "don't add tabs" constraint applies to Master Setup),
  // but registered so the Area field on those 5 Sales masters can be a
  // real live dropdown instead of free text.
  {
    key: "areaMaster",
    title: "Area Master",
    keyFields: ["areaCode"],
    fields: [
      { key: "areaCode", label: "Area Code" },
      { key: "areaName", label: "Area Name" },
      { key: "hq", label: "HQ", sourceMaster: "territoryHqMaster", sourceField: "headquartersName" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "therapyMaster",
    title: "Therapy Master",
    keyFields: ["therapyCode"],
    fields: [
      { key: "therapyCode", label: "Therapy Code" },
      { key: "therapyName", label: "Therapy Name" },
      { key: "description", label: "Description" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "moleculeMaster",
    title: "Molecule Master",
    keyFields: ["moleculeCode"],
    fields: [
      { key: "moleculeCode", label: "Molecule Code" },
      { key: "moleculeName", label: "Molecule Name" },
      { key: "therapy", label: "Therapy", sourceMaster: "therapyMaster", sourceField: "therapyName" },
      { key: "description", label: "Description" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "brandMaster",
    title: "Brand Master",
    keyFields: ["brandCode"],
    fields: [
      { key: "brandCode", label: "Brand Code" },
      { key: "brandName", label: "Brand Name" },
      { key: "molecule", label: "Molecule", sourceMaster: "moleculeMaster", sourceField: "moleculeName" },
      { key: "therapy", label: "Therapy", sourceMaster: "therapyMaster", sourceField: "therapyName" },
      { key: "division", label: "Division", sourceMaster: "divisionMaster", sourceField: "divisionName" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "productMaster",
    title: "Product Master",
    keyFields: ["productCode"],
    fields: [
      { key: "productCode", label: "Product Code" },
      { key: "productName", label: "Product Name" },
      { key: "brand", label: "Brand", sourceMaster: "brandMaster", sourceField: "brandName" },
      { key: "strength", label: "Strength" },
      { key: "pack", label: "Pack" },
      { key: "sku", label: "SKU" },
      { key: "division", label: "Division", sourceMaster: "divisionMaster", sourceField: "divisionName" },
      { key: "uom", label: "UOM", options: ["Tube", "Strip", "Bottle", "Vial", "Box"] },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "rateMaster",
    title: "Rate Master",
    keyFields: ["product", "batchNo"],
    fields: [
      { key: "product", label: "Product", sourceMaster: "productMaster", sourceField: "productName" },
      { key: "batchNo", label: "Batch No" },
      { key: "manufacturingDate", label: "Manufacturing Date", type: "date" },
      { key: "expiryDate", label: "Expiry Date", type: "date" },
      { key: "pack", label: "Pack" },
      { key: "ptr", label: "PTR", type: "number" },
      { key: "pts", label: "PTS", type: "number" },
      { key: "mrp", label: "MRP", type: "number" },
      { key: "effectiveDate", label: "Effective Date", type: "date" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "employees",
    title: "Field Force (Employee Master)",
    keyFields: ["employeeCode"],
    fields: [
      { key: "employeeCode", label: "Employee Code" },
      { key: "name", label: "Employee Name" },
      { key: "designation", label: "Designation", options: [
        "Medical Representative", "Senior Business Executive", "Area Sales Manager",
        "Regional Sales Manager", "Zonal Sales Manager", "National Business Head"
      ] },
      { key: "division", label: "Division", sourceMaster: "divisionMaster", sourceField: "divisionName" },
      { key: "territory", label: "Territory", sourceMaster: "territoryHqMaster", sourceField: "headquartersName" },
      // Request G — "OTH2" never matched the real Employee model's role enum
      // (NBH/BH/RBM/ZBM/ABM/SR_MR/MR/OTHER); harmless while this master
      // wrote to its own disconnected collection, but "employees" now
      // writes straight into that real model, so this has to be a value it
      // actually accepts.
      { key: "role", label: "Role", options: ["NBH", "BH", "RBM", "ABM", "SR_MR", "MR", "ZBM", "OTHER"] },
      { key: "dob", label: "DOB", type: "date" },
      { key: "email", label: "Email" },
      { key: "phone", label: "Phone" },
      { key: "joinDate", label: "Join Date", type: "date" },
      { key: "city", label: "City" },
      { key: "state", label: "State", options: INDIAN_STATES },
      { key: "country", label: "Country", options: ["India"] },
      { key: "reportingManager", label: "Reporting Manager", sourceMaster: "employees", sourceField: "name" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "doctorMaster",
    title: "Doctor Master",
    keyFields: ["doctorCode"],
    uniqueFields: ["doctorName"],
    fields: [
      { key: "doctorCode", label: "Doctor Code" },
      { key: "doctorName", label: "Doctor Name" },
      { key: "qualification", label: "Qualification", options: [
        "MBBS", "MBBS, MD", "MBBS, MS", "MBBS, DM", "MBBS, MCh", "MBBS, DNB", "MBBS, DGO", "MBBS, DCH", "BAMS", "BHMS"
      ] },
      { key: "specialty", label: "Specialty", options: [
        "General Physician", "Pediatrics", "Cardiologist", "Diabetologist", "Pulmonologist",
        "Gastroenterologist", "Dermatologist", "Neurologist", "Nephrologist", "Orthopaedic Surgeon"
      ] },
      { key: "registrationNumber", label: "Registration Number" },
      // The Doctor Master screen also displays these columns (joined in from
      // the Address / Contact Details sub-tabs in the UI) — declared here so
      // the backend actually persists them instead of silently discarding
      // whatever the Add form sends, which is why they always showed blank.
      { key: "clinicName", label: "Clinic Name" },
      { key: "address", label: "Address" },
      { key: "area", label: "Area" },
      { key: "city", label: "City" },
      { key: "state", label: "State", options: INDIAN_STATES },
      { key: "country", label: "Country", options: ["India"] },
      { key: "pinCode", label: "Pin Code" },
      { key: "mobile", label: "Mobile" },
      { key: "phone", label: "Phone" },
      { key: "email", label: "Email" },
      { key: "whatsapp", label: "WhatsApp" }
    ]
  },
  {
    key: "doctorAddress",
    title: "Doctor — Address",
    keyFields: ["doctorCode"],
    fields: [
      { key: "doctorCode", label: "Doctor Code", sourceMaster: "doctorMaster", sourceField: "doctorCode" },
      { key: "doctorName", label: "Doctor Name", computed: { fromField: "doctorCode", sourceMaster: "doctorMaster", lookupField: "doctorCode", displayField: "doctorName" } },
      { key: "clinicName", label: "Clinic Name" },
      { key: "address", label: "Address" },
      { key: "area", label: "Area" },
      { key: "city", label: "City" },
      { key: "state", label: "State", options: INDIAN_STATES },
      { key: "country", label: "Country", options: ["India"] },
      { key: "pinCode", label: "PIN Code" }
    ]
  },
  {
    key: "doctorClassification",
    title: "Doctor — Classification",
    keyFields: ["doctorCode"],
    fields: [
      { key: "doctorCode", label: "Doctor Code", sourceMaster: "doctorMaster", sourceField: "doctorCode" },
      { key: "doctorName", label: "Doctor Name", computed: { fromField: "doctorCode", sourceMaster: "doctorMaster", lookupField: "doctorCode", displayField: "doctorName" } },
      { key: "doctorCategory", label: "Doctor Category (A/B/C)", options: ["A", "B", "C"] },
      { key: "potential", label: "Potential", options: ["High", "Medium", "Low"] },
      { key: "visitFrequency", label: "Visit Frequency", options: [
        "Weekly", "Fortnightly", "Twice a Month", "Monthly", "Once in Two Months", "Quarterly"
      ] },
      { key: "active", label: "Active", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "doctorMapping",
    title: "Doctor — Mapping",
    keyFields: ["doctorCode"],
    fields: [
      { key: "doctorCode", label: "Doctor Code", sourceMaster: "doctorMaster", sourceField: "doctorCode" },
      { key: "doctorName", label: "Doctor Name", computed: { fromField: "doctorCode", sourceMaster: "doctorMaster", lookupField: "doctorCode", displayField: "doctorName" } },
      { key: "division", label: "Division", sourceMaster: "divisionMaster", sourceField: "divisionName" },
      { key: "hq", label: "HQ", sourceMaster: "territoryHqMaster", sourceField: "headquartersName" },
      { key: "patch", label: "Patch", sourceMaster: "patchNameMaster", sourceField: "patchName" },
      { key: "medicalRepresentative", label: "Medical Representative", sourceMaster: "employees", sourceField: "name" },
      { key: "areaManager", label: "Area Manager", sourceMaster: "employees", sourceField: "name" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "doctorDealerMapping",
    title: "Doctor — Dealer Mapping",
    keyFields: ["doctorCode"],
    fields: [
      { key: "doctorCode", label: "Doctor Code", sourceMaster: "doctorMaster", sourceField: "doctorCode" },
      { key: "doctorName", label: "Doctor Name", computed: { fromField: "doctorCode", sourceMaster: "doctorMaster", lookupField: "doctorCode", displayField: "doctorName" } },
      { key: "stockist", label: "Stockist", sourceMaster: "stockistMaster", sourceField: "stockistName" },
      // Zivira_Master_Client_Change_Requirement_3A.docx — Dealer Mapping must
      // reference the real Chemist Master, not a free-text field (which is
      // how a dealer mapping could end up pointing at nothing at all, or at
      // whatever a stray typo happened to say).
      { key: "chemist", label: "Chemist", sourceMaster: "dealers", sourceField: "dealerName" },
      { key: "distributor", label: "Distributor" }
    ]
  },
  {
    key: "doctorContactDetails",
    title: "Doctor — Contact Details",
    keyFields: ["doctorCode"],
    fields: [
      { key: "doctorCode", label: "Doctor Code", sourceMaster: "doctorMaster", sourceField: "doctorCode" },
      { key: "doctorName", label: "Doctor Name", computed: { fromField: "doctorCode", sourceMaster: "doctorMaster", lookupField: "doctorCode", displayField: "doctorName" } },
      { key: "mobile", label: "Mobile" },
      { key: "phone", label: "Phone" },
      { key: "email", label: "Email" },
      { key: "whatsapp", label: "WhatsApp" }
    ]
  },
  {
    key: "doctorAdditionalInfo",
    title: "Doctor — Additional Info",
    keyFields: ["doctorCode"],
    fields: [
      { key: "doctorCode", label: "Doctor Code", sourceMaster: "doctorMaster", sourceField: "doctorCode" },
      { key: "doctorName", label: "Doctor Name", computed: { fromField: "doctorCode", sourceMaster: "doctorMaster", lookupField: "doctorCode", displayField: "doctorName" } },
      { key: "birthDate", label: "Birth Date", type: "date" },
      { key: "anniversary", label: "Anniversary", type: "date" },
      { key: "remarks", label: "Remarks" },
      { key: "latitude", label: "Latitude", type: "number" },
      { key: "longitude", label: "Longitude", type: "number" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "inputMaster",
    title: "Input Master",
    keyFields: ["inputCode"],
    fields: [
      { key: "inputCode", label: "Input Code" },
      { key: "inputName", label: "Input Name" },
      { key: "category", label: "Category", options: [
        "Active Pharmaceutical Ingredient (API)", "Excipient", "Solvent", "Packaging Material",
        "Printing Material", "Cleaning Material", "Laboratory Reagent", "Consumable"
      ] },
      { key: "unit", label: "Unit", options: ["Kg", "Litre", "Nos", "Roll", "Box"] },
      // The Input Master screen also shows these columns — declared here so
      // the backend persists them instead of silently discarding whatever
      // the Add form sends, which is why they always showed blank.
      { key: "typeOfInput", label: "Type of Input", options: ["Physical", "Digital", "Financial"] },
      { key: "division", label: "Division", sourceMaster: "divisionMaster", sourceField: "divisionName" },
      { key: "valueOfInput", label: "Value of Input" },
      { key: "fromDate", label: "From", type: "date" },
      { key: "toDate", label: "To", type: "date" },
      { key: "financialYear", label: "Financial Year" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "patchNameMaster",
    title: "Patch Name Master",
    keyFields: ["patchCode"],
    fields: [
      { key: "patchCode", label: "Patch Code" },
      { key: "patchName", label: "Patch Name" },
      { key: "hq", label: "HQ", sourceMaster: "territoryHqMaster", sourceField: "headquartersName" },
      { key: "region", label: "Region", sourceMaster: "regionZoneMaster", sourceField: "regionName" },
      { key: "division", label: "Division", sourceMaster: "divisionMaster", sourceField: "divisionName" },
      { key: "medicalRepresentative", label: "Medical Representative", sourceMaster: "employees", sourceField: "name" },
      { key: "areaManager", label: "Area Manager", sourceMaster: "employees", sourceField: "name" },
      { key: "noOfDoctors", label: "No of Doctors", type: "number" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "attendance",
    title: "Attendance",
    keyFields: ["date", "employee"],
    fields: [
      { key: "date", label: "Date", type: "date" },
      { key: "employee", label: "Employee", sourceMaster: "employees", sourceField: "name" },
      { key: "employeeCode", label: "Employee Code", computed: { fromField: "employee", sourceMaster: "employees", lookupField: "name", displayField: "employeeCode" } },
      { key: "hq", label: "HQ", sourceMaster: "territoryHqMaster", sourceField: "headquartersName" },
      { key: "attendanceType", label: "Attendance Type", options: ["Field Work", "Office", "Half Day", "Meeting", "Leave", "Admin"] },
      { key: "checkIn", label: "Check In" },
      { key: "checkOut", label: "Check Out" },
      { key: "gps", label: "GPS" },
      { key: "remarks", label: "Remarks" }
    ]
  },
  {
    key: "holidayStateMaster",
    title: "Holiday — State Master",
    keyFields: ["state", "holidayName"],
    fields: [
      { key: "state", label: "State", options: INDIAN_STATES },
      { key: "holidayName", label: "Holiday Name" },
      { key: "date", label: "Date", type: "date" },
      { key: "holidayType", label: "Holiday Type", options: ["State Holiday", "National Holiday"] },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "holidayCalendar",
    title: "Holiday Calendar",
    keyFields: ["year", "state", "holiday"],
    fields: [
      { key: "year", label: "Year", type: "number" },
      { key: "state", label: "State", options: INDIAN_STATES },
      { key: "holiday", label: "Holiday" },
      { key: "holidayDate", label: "Holiday Date", type: "date" },
      { key: "holidayType", label: "Holiday Type", options: ["State Holiday", "National Holiday"] },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "stockistMaster",
    title: "Stockist Master",
    keyFields: ["stockistCode"],
    fields: [
      { key: "stockistCode", label: "Stockist Code" },
      { key: "stockistName", label: "Stockist Name" },
      { key: "gstNo", label: "GST No" },
      { key: "licenseNo", label: "License No" },
      // The Stockist Master screen (both the regular and "Super Stockist"
      // views) also shows these columns — declared here so the backend
      // persists them instead of silently discarding whatever the Add form
      // sends, which is why they always showed blank.
      { key: "contactNumber", label: "Contact Number" },
      { key: "emailAddress", label: "Email Address" },
      { key: "territory", label: "Territory", sourceMaster: "patchNameMaster", sourceField: "patchName" },
      { key: "hq", label: "HQ", sourceMaster: "territoryHqMaster", sourceField: "headquartersName" },
      { key: "state", label: "State", options: INDIAN_STATES },
      { key: "pinCode", label: "Pin Code" },
      { key: "location", label: "Location" },
      { key: "city", label: "City" },
      { key: "pincode", label: "Pincode" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "stockistAddress",
    title: "Stockist — Address",
    keyFields: ["stockistCode"],
    fields: [
      { key: "stockistCode", label: "Stockist Code", sourceMaster: "stockistMaster", sourceField: "stockistCode" },
      { key: "address", label: "Address" },
      { key: "city", label: "City" },
      { key: "state", label: "State", options: INDIAN_STATES },
      { key: "pin", label: "PIN" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "stockistContact",
    title: "Stockist — Contact",
    keyFields: ["stockistCode"],
    fields: [
      { key: "stockistCode", label: "Stockist Code", sourceMaster: "stockistMaster", sourceField: "stockistCode" },
      { key: "contactPerson", label: "Contact Person" },
      { key: "mobile", label: "Mobile" },
      { key: "email", label: "Email" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "stockistHeadquarters",
    title: "Stockist — Headquarters",
    keyFields: ["stockistCode"],
    fields: [
      { key: "stockistCode", label: "Stockist Code", sourceMaster: "stockistMaster", sourceField: "stockistCode" },
      { key: "hq", label: "HQ", sourceMaster: "territoryHqMaster", sourceField: "headquartersName" },
      { key: "territory", label: "Territory", sourceMaster: "patchNameMaster", sourceField: "patchName" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "stockistDivisionMapping",
    title: "Stockist — Division Mapping",
    keyFields: ["stockistCode"],
    fields: [
      { key: "stockistCode", label: "Stockist Code", sourceMaster: "stockistMaster", sourceField: "stockistCode" },
      { key: "division", label: "Division", sourceMaster: "divisionMaster", sourceField: "divisionName" },
      { key: "products", label: "Products" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "stockistBankDetails",
    title: "Stockist — Bank Details",
    keyFields: ["stockistCode"],
    fields: [
      { key: "stockistCode", label: "Stockist Code", sourceMaster: "stockistMaster", sourceField: "stockistCode" },
      { key: "bank", label: "Bank" },
      { key: "accountNo", label: "Account No" },
      { key: "ifsc", label: "IFSC" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "stockistLicenseDetails",
    title: "Stockist — License Details",
    keyFields: ["stockistCode"],
    fields: [
      { key: "stockistCode", label: "Stockist Code", sourceMaster: "stockistMaster", sourceField: "stockistCode" },
      { key: "drugLicense", label: "Drug License" },
      { key: "expiryDate", label: "Expiry Date", type: "date" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "stockistStatus",
    title: "Stockist — Status",
    keyFields: ["stockist"],
    fields: [
      { key: "stockist", label: "Stockist", sourceMaster: "stockistMaster", sourceField: "stockistName" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  // Zivira_Master_Client_Change_Requirement_3A.docx — "Dealer Mapping should
  // use Chemist Master data, not Doctor/Stockist data." The Admin portal
  // already has a real, live Chemist Master screen (components/chemist-
  // master.tsx, "Add Chemist") — it just isn't backed by the generic masters
  // registry, it's the dedicated /company/dealers collection. Every "Chemist"
  // dropdown below used to point at stockistMaster (or, for Dealer Mapping,
  // wasn't linked to any master at all) simply because "dealers" wasn't
  // reachable through this registry's sourceMaster mechanism. This entry
  // doesn't add a new tab or a new dataset — it exposes the SAME "dealers"
  // collection the live Chemist Master screen already reads and writes,
  // purely so other masters can reference real chemist records by name.
  {
    key: "dealers",
    title: "Chemist / Dealer",
    keyFields: ["dealerName"],
    fields: [
      { key: "sourceSNo", label: "S.No", type: "number" },
      { key: "dealerName", label: "Chemist Name" },
      { key: "employeeName", label: "Employee Name" },
      { key: "employeeCode", label: "Employee Code" },
      { key: "patchName", label: "Patch Name" },
      { key: "contactPersonName", label: "Contact Person Name" },
      { key: "dealerPhone", label: "Phone" },
      { key: "dealerEmail", label: "Email" },
      { key: "country", label: "Country" },
      { key: "state", label: "State" },
      { key: "city", label: "City" },
      { key: "location", label: "Location" },
      { key: "pincode", label: "Pincode" },
      { key: "address", label: "Address" },
      { key: "status", label: "Status", options: ["ACTIVE", "INACTIVE"] }
    ]
  },
  {
    key: "sfc",
    title: "SFC (Standard Field Coverage)",
    keyFields: ["sourceSNo"],
    fields: [
      { key: "sourceSNo", label: "S.No", type: "number" },
      { key: "employeeName", label: "Employee Name", sourceMaster: "employees", sourceField: "name" },
      { key: "employeeCode", label: "Employee Code", computed: { fromField: "employeeName", sourceMaster: "employees", lookupField: "name", displayField: "employeeCode" } },
      { key: "hq", label: "HQ", sourceMaster: "territoryHqMaster", sourceField: "headquartersName" },
      { key: "patchName", label: "Patch Name", sourceMaster: "patchNameMaster", sourceField: "patchName" },
      { key: "typeRaw", label: "Type", options: ["Tour", "Outstation Work", "Outstation Excursion", "Admin"] },
      { key: "oneWayKms", label: "One Way KMs", type: "number" },
      { key: "region", label: "Region", sourceMaster: "regionZoneMaster", sourceField: "regionName" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "expenseTypes",
    title: "Expense Types",
    keyFields: ["expenseType"],
    fields: [
      { key: "expenseType", label: "Expense Type" },
      { key: "description", label: "Description" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "allowanceFixation",
    title: "Allowance Fixation",
    keyFields: ["location"],
    fields: [
      { key: "location", label: "Location" },
      { key: "type", label: "Type", options: ["Metro", "Non-Metro"] },
      { key: "dailyAllowance", label: "Daily Allowance" }
    ]
  },
  {
    key: "expenseCategory",
    title: "Expense Category",
    keyFields: ["category"],
    fields: [
      { key: "category", label: "Category" },
      { key: "maximumLimit", label: "Maximum Limit" }
    ]
  },
  {
    key: "managerTravelApproval",
    title: "Manager Expense — Travel Approval",
    keyFields: ["claimId"],
    fields: [
      { key: "employee", label: "Employee", sourceMaster: "employees", sourceField: "name" },
      { key: "claimId", label: "Claim ID" },
      { key: "amount", label: "Amount", type: "number" },
      { key: "status", label: "Status", options: ["Approved", "Pending", "Rejected"] }
    ]
  },
  {
    key: "expenseApproval",
    title: "Expense Approval",
    keyFields: ["claimId"],
    fields: [
      { key: "employee", label: "Employee", sourceMaster: "employees", sourceField: "name" },
      { key: "claimId", label: "Claim ID" },
      { key: "amount", label: "Amount", type: "number" },
      { key: "status", label: "Status", options: ["Approved", "Pending", "Rejected"] }
    ]
  },
  {
    key: "employeePersonalInfo",
    title: "Employee Personal Information",
    keyFields: ["employeeCode"],
    fields: [
      { key: "employeeCode", label: "Employee Code", sourceMaster: "employees", sourceField: "employeeCode" },
      { key: "employeeName", label: "Employee Name", computed: { fromField: "employeeCode", sourceMaster: "employees", lookupField: "employeeCode", displayField: "name" } },
      { key: "fathersName", label: "Father's Name" },
      { key: "mothersName", label: "Mother's Name" },
      { key: "bloodGroup", label: "Blood Group", options: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] },
      { key: "aadhaar", label: "Aadhaar" },
      { key: "pan", label: "PAN" },
      { key: "passport", label: "Passport" },
      { key: "emergencyContact", label: "Emergency Contact" },
      { key: "bankDetails", label: "Bank Details" }
    ]
  },
  {
    key: "expenseReports",
    title: "Manager Expense — Reports",
    keyFields: ["monthly", "team"],
    fields: [
      { key: "monthly", label: "Monthly" },
      { key: "team", label: "Team", options: ["Zivira Field Team", "Astra Field Team", "Aura Field Team", "South Zone Managers"] },
      { key: "budget", label: "Budget", type: "number" }
    ]
  },
  // "Reporting Structure" is a distinct view the frontend offers alongside
  // Manager Expense — Reports (same screen, a toggle button switches
  // between them) — but it's a genuinely different table (division's
  // reporting chain, not a monthly budget), so it gets its own registry key
  // instead of reusing expenseReports' fields/keyFields, which would make
  // every add fail validation (no monthly/team inputs are ever shown in
  // this view, so those required fields would always be missing).
  {
    key: "reportingStructure",
    title: "Reporting Structure",
    // A division alone isn't unique — there are only 3 divisions but 10
    // territories/zones, each with its own local reporting chain, so the
    // natural key pairs Division with Zone.
    keyFields: ["division", "zone"],
    fields: [
      { key: "division", label: "Division", sourceMaster: "divisionMaster", sourceField: "divisionName" },
      { key: "zone", label: "Zone", sourceMaster: "regionZoneMaster", sourceField: "zoneName" },
      { key: "bh", label: "BH", sourceMaster: "employees", sourceField: "name" },
      { key: "zbm", label: "ZBM", sourceMaster: "employees", sourceField: "name" },
      { key: "rbm", label: "RBM", sourceMaster: "employees", sourceField: "name" },
      { key: "abm", label: "ABM", sourceMaster: "employees", sourceField: "name" },
      { key: "be", label: "BE", sourceMaster: "employees", sourceField: "name" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "personalInformationView",
    title: "Personal — View",
    keyFields: ["employeeCode"],
    fields: [
      { key: "employeeCode", label: "Employee Code", sourceMaster: "employees", sourceField: "employeeCode" },
      { key: "employeeName", label: "Employee Name", computed: { fromField: "employeeCode", sourceMaster: "employees", lookupField: "employeeCode", displayField: "name" } },
      { key: "contactNo", label: "Contact No" },
      { key: "personalEmail", label: "Personal Email" },
      { key: "panNo", label: "PAN No" },
      { key: "aadharNo", label: "Aadhar No" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },

  // ── Daily MR Work (6 entry masters) ─────────────────────────────────────
  {
    key: "dcrEntry",
    title: "Daily Call Report",
    keyFields: ["date", "employee", "doctor"],
    fields: [
      { key: "date", label: "Date", type: "date" },
      { key: "employee", label: "Employee", sourceMaster: "employees", sourceField: "name" },
      { key: "hq", label: "HQ", sourceMaster: "territoryHqMaster", sourceField: "headquartersName" },
      { key: "patch", label: "Patch", sourceMaster: "patchNameMaster", sourceField: "patchName" },
      { key: "doctor", label: "Doctor", sourceMaster: "doctorMaster", sourceField: "doctorName" },
      { key: "chemist", label: "Chemist", sourceMaster: "dealers", sourceField: "dealerName" },
      { key: "hospital", label: "Hospital" },
      { key: "productsPromoted", label: "Products Promoted", sourceMaster: "productMaster", sourceField: "productName" },
      { key: "samplesIssued", label: "Samples Issued" },
      { key: "callType", label: "Call Type", options: ["Single", "Joint", "Group", "Conference"] },
      { key: "visitTime", label: "Visit Time" },
      { key: "remarks", label: "Remarks" },
      { key: "nextVisitDate", label: "Next Visit Date", type: "date" }
    ]
  },
  {
    key: "tourPlanEntry",
    title: "Tour Plan",
    keyFields: ["tourDate", "employee"],
    fields: [
      { key: "tourDate", label: "Tour Date", type: "date" },
      { key: "employee", label: "Employee", sourceMaster: "employees", sourceField: "name" },
      { key: "hq", label: "HQ", sourceMaster: "territoryHqMaster", sourceField: "headquartersName" },
      { key: "patch", label: "Patch", sourceMaster: "patchNameMaster", sourceField: "patchName" },
      { key: "plannedDoctors", label: "Planned Doctors", type: "number" },
      { key: "plannedChemists", label: "Planned Chemists", type: "number" },
      { key: "plannedHospitals", label: "Planned Hospitals", type: "number" },
      { key: "purpose", label: "Purpose", options: ["Regular Coverage", "New Launch", "Camp Visit", "Joint Work", "Conference"] },
      { key: "status", label: "Status", options: ["Approved", "Pending", "Rejected"] }
    ]
  },
  {
    key: "expenseEntry",
    title: "Expense",
    keyFields: ["expenseDate", "employee", "billNumber"],
    fields: [
      { key: "expenseDate", label: "Expense Date", type: "date" },
      { key: "employee", label: "Employee", sourceMaster: "employees", sourceField: "name" },
      { key: "expenseType", label: "Expense Type", sourceMaster: "expenseTypes", sourceField: "expenseType" },
      { key: "amount", label: "Amount", type: "number" },
      { key: "billNumber", label: "Bill Number" },
      { key: "attachment", label: "Attachment" },
      { key: "approvalStatus", label: "Approval Status", options: ["Approved", "Pending", "Rejected"] },
      { key: "remarks", label: "Remarks" }
    ]
  },
  {
    key: "leaveEntry",
    title: "Leaves",
    keyFields: ["employee", "fromDate", "toDate"],
    fields: [
      { key: "employee", label: "Employee", sourceMaster: "employees", sourceField: "name" },
      { key: "leaveType", label: "Leave Type", options: [
        "Casual Leave", "Sick Leave", "Earned Leave", "Comp-Off", "Maternity Leave", "Paternity Leave", "Loss of Pay"
      ] },
      { key: "fromDate", label: "From Date", type: "date" },
      { key: "toDate", label: "To Date", type: "date" },
      { key: "totalDays", label: "Total Days", type: "number" },
      { key: "reason", label: "Reason" },
      { key: "approvedBy", label: "Approved By", sourceMaster: "employees", sourceField: "name" },
      { key: "status", label: "Status", options: ["Approved", "Pending", "Rejected"] }
    ]
  },
  {
    key: "campEntry",
    title: "Camp",
    keyFields: ["campCode"],
    fields: [
      { key: "campCode", label: "Camp Code" },
      { key: "campName", label: "Camp Name" },
      { key: "campDate", label: "Camp Date", type: "date" },
      { key: "hospital", label: "Hospital" },
      { key: "doctor", label: "Doctor", sourceMaster: "doctorMaster", sourceField: "doctorName" },
      { key: "organizer", label: "Organizer", sourceMaster: "employees", sourceField: "name" },
      { key: "noOfPatients", label: "No. of Patients", type: "number" },
      { key: "productsDisplayed", label: "Products Displayed", sourceMaster: "productMaster", sourceField: "productName" },
      { key: "remarks", label: "Remarks" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "marketSurveyEntry",
    title: "Market Survey",
    keyFields: ["surveyDate", "employee", "competitorBrand"],
    fields: [
      { key: "surveyDate", label: "Survey Date", type: "date" },
      { key: "employee", label: "Employee", sourceMaster: "employees", sourceField: "name" },
      { key: "hq", label: "HQ", sourceMaster: "territoryHqMaster", sourceField: "headquartersName" },
      { key: "patch", label: "Patch", sourceMaster: "patchNameMaster", sourceField: "patchName" },
      { key: "chemist", label: "Chemist", sourceMaster: "dealers", sourceField: "dealerName" },
      { key: "competitorCompany", label: "Competitor Company" },
      { key: "competitorBrand", label: "Competitor Brand" },
      { key: "competitorProduct", label: "Competitor Product" },
      { key: "competitorMrp", label: "Competitor MRP", type: "number" },
      { key: "availability", label: "Availability", options: ["Available", "Out of Stock", "Short Supply"] },
      { key: "feedback", label: "Feedback" },
      { key: "remarks", label: "Remarks" }
    ]
  },

  // ── Manager Activity Report (10 report masters) ─────────────────────────
  {
    key: "attendanceReport",
    title: "Attendance Report",
    keyFields: ["date", "employeeCode"],
    fields: [
      { key: "date", label: "Date", type: "date" },
      { key: "employeeCode", label: "Employee Code", sourceMaster: "employees", sourceField: "employeeCode" },
      { key: "employeeName", label: "Employee Name", computed: { fromField: "employeeCode", sourceMaster: "employees", lookupField: "employeeCode", displayField: "name" } },
      { key: "division", label: "Division", sourceMaster: "divisionMaster", sourceField: "divisionName" },
      { key: "hq", label: "HQ", sourceMaster: "territoryHqMaster", sourceField: "headquartersName" },
      { key: "patch", label: "Patch", sourceMaster: "patchNameMaster", sourceField: "patchName" },
      { key: "attendanceType", label: "Attendance Type", options: ["Field Work", "Office", "Half Day", "Meeting", "Leave", "Admin"] },
      { key: "checkIn", label: "Check In" },
      { key: "checkOut", label: "Check Out" },
      { key: "totalWorkingHours", label: "Total Working Hours" },
      { key: "gpsCheckIn", label: "GPS Check-In" },
      { key: "gpsCheckOut", label: "GPS Check-Out" },
      { key: "managerApproval", label: "Manager Approval", options: ["Approved", "Pending", "Rejected"] },
      { key: "remarks", label: "Remarks" }
    ]
  },
  {
    key: "dcrSummaryReport",
    title: "Daily Call Report Summary",
    keyFields: ["date", "employeeCode"],
    fields: [
      { key: "date", label: "Date", type: "date" },
      { key: "employeeCode", label: "Employee Code", sourceMaster: "employees", sourceField: "employeeCode" },
      { key: "medicalRepresentative", label: "Medical Representative", computed: { fromField: "employeeCode", sourceMaster: "employees", lookupField: "employeeCode", displayField: "name" } },
      { key: "division", label: "Division", sourceMaster: "divisionMaster", sourceField: "divisionName" },
      { key: "hq", label: "HQ", sourceMaster: "territoryHqMaster", sourceField: "headquartersName" },
      { key: "patch", label: "Patch", sourceMaster: "patchNameMaster", sourceField: "patchName" },
      { key: "plannedCalls", label: "Planned Calls", type: "number" },
      { key: "callsCompleted", label: "Calls Completed", type: "number" },
      { key: "doctorsVisited", label: "Doctors Visited", type: "number" },
      { key: "chemistsVisited", label: "Chemists Visited", type: "number" },
      { key: "hospitalsVisited", label: "Hospitals Visited", type: "number" },
      { key: "productsPromoted", label: "Products Promoted" },
      { key: "samplesDistributed", label: "Samples Distributed" },
      { key: "giftsDistributed", label: "Gifts Distributed" },
      { key: "workingHours", label: "Working Hours" }
    ]
  },
  {
    key: "tourPlanReport",
    title: "Tour Plan Report",
    keyFields: ["tourDate", "employeeCode"],
    fields: [
      { key: "tourDate", label: "Tour Date", type: "date" },
      { key: "employeeCode", label: "Employee Code", sourceMaster: "employees", sourceField: "employeeCode" },
      { key: "medicalRepresentative", label: "Medical Representative", computed: { fromField: "employeeCode", sourceMaster: "employees", lookupField: "employeeCode", displayField: "name" } },
      { key: "division", label: "Division", sourceMaster: "divisionMaster", sourceField: "divisionName" },
      { key: "hq", label: "HQ", sourceMaster: "territoryHqMaster", sourceField: "headquartersName" },
      { key: "patch", label: "Patch", sourceMaster: "patchNameMaster", sourceField: "patchName" },
      { key: "plannedDoctorVisits", label: "Planned Doctor Visits", type: "number" },
      { key: "actualDoctorVisits", label: "Actual Doctor Visits", type: "number" },
      { key: "achievementPercentage", label: "Achievement %", type: "number" },
      { key: "tourStatus", label: "Tour Status", options: ["Completed", "Pending", "Cancelled"] },
      { key: "managerApproval", label: "Manager Approval", options: ["Approved", "Pending", "Rejected"] }
    ]
  },
  {
    key: "expenseReport",
    title: "Expense Report",
    keyFields: ["expenseDate", "employeeCode"],
    fields: [
      { key: "expenseDate", label: "Expense Date", type: "date" },
      { key: "employeeCode", label: "Employee Code", sourceMaster: "employees", sourceField: "employeeCode" },
      { key: "employeeName", label: "Employee Name", computed: { fromField: "employeeCode", sourceMaster: "employees", lookupField: "employeeCode", displayField: "name" } },
      { key: "division", label: "Division", sourceMaster: "divisionMaster", sourceField: "divisionName" },
      { key: "hq", label: "HQ", sourceMaster: "territoryHqMaster", sourceField: "headquartersName" },
      { key: "expenseType", label: "Expense Type", sourceMaster: "expenseTypes", sourceField: "expenseType" },
      { key: "description", label: "Description" },
      { key: "amount", label: "Amount", type: "number" },
      { key: "receiptAttached", label: "Receipt Attached", options: ["Yes", "No"] },
      { key: "approvalStatus", label: "Approval Status", options: ["Approved", "Pending", "Rejected"] },
      { key: "approvedBy", label: "Approved By", sourceMaster: "employees", sourceField: "name" }
    ]
  },
  {
    key: "leaveReport",
    title: "Leave Report",
    keyFields: ["employee", "fromDate"],
    fields: [
      { key: "employee", label: "Employee", sourceMaster: "employees", sourceField: "name" },
      { key: "hq", label: "HQ", sourceMaster: "territoryHqMaster", sourceField: "headquartersName" },
      { key: "leaveType", label: "Leave Type", options: [
        "Casual Leave", "Sick Leave", "Earned Leave", "Comp-Off", "Maternity Leave", "Paternity Leave", "Loss of Pay"
      ] },
      { key: "fromDate", label: "From Date", type: "date" },
      { key: "toDate", label: "To Date", type: "date" },
      { key: "totalDays", label: "Total Days", type: "number" },
      { key: "reason", label: "Reason" },
      { key: "status", label: "Status", options: ["Approved", "Pending", "Rejected"] },
      { key: "approvedBy", label: "Approved By", sourceMaster: "employees", sourceField: "name" }
    ]
  },
  {
    key: "campReport",
    title: "Camp Report",
    keyFields: ["campDate", "campName"],
    fields: [
      { key: "campDate", label: "Camp Date", type: "date" },
      { key: "campName", label: "Camp Name" },
      { key: "hospital", label: "Hospital" },
      { key: "doctor", label: "Doctor", sourceMaster: "doctorMaster", sourceField: "doctorName" },
      { key: "mr", label: "MR", sourceMaster: "employees", sourceField: "name" },
      { key: "patients", label: "Patients", type: "number" },
      { key: "productsPromoted", label: "Products Promoted", sourceMaster: "productMaster", sourceField: "productName" },
      { key: "samples", label: "Samples" },
      { key: "status", label: "Status", options: ["Completed", "Pending", "Cancelled"] }
    ]
  },
  {
    key: "marketSurveyReport",
    title: "Market Survey Report",
    keyFields: ["surveyDate", "mr", "competitorBrand"],
    fields: [
      { key: "surveyDate", label: "Survey Date", type: "date" },
      { key: "mr", label: "MR", sourceMaster: "employees", sourceField: "name" },
      { key: "hq", label: "HQ", sourceMaster: "territoryHqMaster", sourceField: "headquartersName" },
      { key: "competitorCompany", label: "Competitor Company" },
      { key: "competitorBrand", label: "Competitor Brand" },
      { key: "competitorProduct", label: "Competitor Product" },
      { key: "mrp", label: "MRP", type: "number" },
      { key: "availability", label: "Availability", options: ["Available", "Out of Stock", "Short Supply"] },
      { key: "marketDemand", label: "Market Demand", options: ["High", "Medium", "Low"] },
      { key: "approval", label: "Approval", options: ["Approved", "Pending", "Rejected"] }
    ]
  },
  {
    key: "doctorCoverageReport",
    title: "Doctor Coverage Report",
    keyFields: ["doctor", "mr"],
    fields: [
      { key: "doctor", label: "Doctor", sourceMaster: "doctorMaster", sourceField: "doctorName" },
      { key: "category", label: "Category", options: ["Super Core", "Core", "Non Core"] },
      { key: "specialty", label: "Specialty", computed: { fromField: "doctor", sourceMaster: "doctorMaster", lookupField: "doctorName", displayField: "specialty" } },
      { key: "mr", label: "MR", sourceMaster: "employees", sourceField: "name" },
      { key: "plannedVisits", label: "Planned Visits", type: "number" },
      { key: "actualVisits", label: "Actual Visits", type: "number" },
      { key: "missedVisits", label: "Missed Visits", type: "number" },
      { key: "coveragePercentage", label: "Coverage %", type: "number" },
      { key: "status", label: "Status", options: ["Visited", "Pending", "Missed"] }
    ]
  },
  {
    key: "chemistCoverageReport",
    title: "Chemist Coverage Report",
    keyFields: ["chemist", "mr"],
    fields: [
      { key: "chemist", label: "Chemist", sourceMaster: "dealers", sourceField: "dealerName" },
      { key: "type", label: "Type", options: ["Core", "Non Core"] },
      { key: "mr", label: "MR", sourceMaster: "employees", sourceField: "name" },
      { key: "plannedVisits", label: "Planned Visits", type: "number" },
      { key: "actualVisits", label: "Actual Visits", type: "number" },
      { key: "missedVisits", label: "Missed Visits", type: "number" },
      { key: "coveragePercentage", label: "Coverage %", type: "number" },
      { key: "status", label: "Status", options: ["Visited", "Pending", "Missed"] }
    ]
  },
  {
    key: "productivityDashboard",
    title: "Productivity Dashboard",
    keyFields: ["employee"],
    fields: [
      { key: "rank", label: "Rank", type: "number" },
      { key: "employee", label: "Employee", sourceMaster: "employees", sourceField: "name" },
      { key: "hq", label: "HQ", sourceMaster: "territoryHqMaster", sourceField: "headquartersName" },
      { key: "doctorCalls", label: "Doctor Calls", type: "number" },
      { key: "tourCompliance", label: "Tour Compliance", type: "number" },
      { key: "productivityScore", label: "Productivity Score", type: "number" }
    ]
  },

  // ── Sales (4 masters) ────────────────────────────────────────────────
  // These were previously only faked client-side (a hardcoded schema in
  // generic-master-table.tsx with no backend collection behind it), so
  // every save 404'd with "Unknown master" and the tables always showed 0
  // records. Now real registry entries, cross-linked to Division/Region/
  // Territory/Product the same way every other master is.
  // Zivira_Master_Tab_Client_Change_3B.docx — the Sales tab's five buttons
  // (Target Master, Primary Sales, Secondary Sales, Claims Master, IMS) and
  // their exact field lists. Target Value / Net Sale Unit / Net Sale Value
  // are computed server-side (masters.routes.ts) from Target Unit×Unit
  // Price and Sales−Return respectively, per "the key calculations should
  // be centralized in the backend/service layer rather than duplicated in
  // the frontend" — the client still sees plain fields, just read-only ones.
  {
    key: "targetMaster",
    title: "Target Master",
    keyFields: ["division", "hq", "product", "month"],
    fields: [
      { key: "division", label: "Division", sourceMaster: "divisionMaster", sourceField: "divisionName" },
      { key: "zone", label: "Zone", sourceMaster: "regionZoneMaster", sourceField: "zoneName" },
      { key: "region", label: "Region", sourceMaster: "regionZoneMaster", sourceField: "regionName" },
      { key: "area", label: "Area", sourceMaster: "areaMaster", sourceField: "areaName" },
      { key: "hq", label: "HQ", sourceMaster: "territoryHqMaster", sourceField: "headquartersName" },
      { key: "product", label: "Product", sourceMaster: "productMaster", sourceField: "productName" },
      { key: "month", label: "Month" },
      { key: "targetUnit", label: "Target Unit", type: "number" },
      { key: "unitPrice", label: "Unit Price", type: "number" },
      // Target Value = Target Unit × Unit Price (server-computed on save).
      { key: "targetValue", label: "Target Value", type: "number" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "primarySales",
    title: "Primary Sales",
    // Primary Sales = Company -> Stockist (Zivira_Master_Tab_Client_Change_3B.docx).
    keyFields: ["division", "hq", "product", "month", "stockist"],
    fields: [
      { key: "division", label: "Division", sourceMaster: "divisionMaster", sourceField: "divisionName" },
      { key: "zone", label: "Zone", sourceMaster: "regionZoneMaster", sourceField: "zoneName" },
      { key: "region", label: "Region", sourceMaster: "regionZoneMaster", sourceField: "regionName" },
      { key: "area", label: "Area", sourceMaster: "areaMaster", sourceField: "areaName" },
      { key: "hq", label: "HQ", sourceMaster: "territoryHqMaster", sourceField: "headquartersName" },
      { key: "product", label: "Product", sourceMaster: "productMaster", sourceField: "productName" },
      { key: "month", label: "Month" },
      { key: "stockist", label: "Stockist", sourceMaster: "stockistMaster", sourceField: "stockistName" },
      { key: "salesUnit", label: "Sales Unit", type: "number" },
      { key: "salesValue", label: "Sales Value", type: "number" },
      { key: "freeUnit", label: "Free Unit", type: "number" },
      { key: "freeValue", label: "Free Value", type: "number" },
      { key: "returnUnit", label: "Return Unit", type: "number" },
      { key: "returnValue", label: "Return Value", type: "number" },
      // Net Sale Unit/Value = Sales − Return (server-computed on save).
      { key: "netSaleUnit", label: "Net Sale Unit", type: "number" },
      { key: "netSaleValue", label: "Net Sale Value", type: "number" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "secondarySales",
    title: "Secondary Sales",
    // Secondary Sales = Stockist -> Chemist (Zivira_Master_Tab_Client_Change_3B.docx)
    // — this is the same "Chemist" real-data link fixed for Dealer Mapping
    // in Zivira_Master_Client_Change_Requirement_3A.docx (sourceMaster:
    // "dealers" — the live Chemist Master's actual collection).
    keyFields: ["division", "hq", "product", "month", "stockist", "chemist"],
    fields: [
      { key: "division", label: "Division", sourceMaster: "divisionMaster", sourceField: "divisionName" },
      { key: "zone", label: "Zone", sourceMaster: "regionZoneMaster", sourceField: "zoneName" },
      { key: "region", label: "Region", sourceMaster: "regionZoneMaster", sourceField: "regionName" },
      { key: "area", label: "Area", sourceMaster: "areaMaster", sourceField: "areaName" },
      { key: "hq", label: "HQ", sourceMaster: "territoryHqMaster", sourceField: "headquartersName" },
      { key: "product", label: "Product", sourceMaster: "productMaster", sourceField: "productName" },
      { key: "month", label: "Month" },
      { key: "stockist", label: "Stockist", sourceMaster: "stockistMaster", sourceField: "stockistName" },
      { key: "chemist", label: "Chemist", sourceMaster: "dealers", sourceField: "dealerName" },
      { key: "salesUnit", label: "Sales Unit", type: "number" },
      { key: "salesValue", label: "Sales Value", type: "number" },
      { key: "freeUnit", label: "Free Unit", type: "number" },
      { key: "freeValue", label: "Free Value", type: "number" },
      { key: "returnUnit", label: "Return Unit", type: "number" },
      { key: "returnValue", label: "Return Value", type: "number" },
      // Net Sale Unit/Value = Sales − Return (server-computed on save).
      { key: "netSaleUnit", label: "Net Sale Unit", type: "number" },
      { key: "netSaleValue", label: "Net Sale Value", type: "number" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "claimsMaster",
    title: "Claims Master",
    keyFields: ["division", "hq", "product", "stockist", "claimDate"],
    fields: [
      { key: "division", label: "Division", sourceMaster: "divisionMaster", sourceField: "divisionName" },
      { key: "zone", label: "Zone", sourceMaster: "regionZoneMaster", sourceField: "zoneName" },
      { key: "region", label: "Region", sourceMaster: "regionZoneMaster", sourceField: "regionName" },
      { key: "area", label: "Area", sourceMaster: "areaMaster", sourceField: "areaName" },
      { key: "hq", label: "HQ", sourceMaster: "territoryHqMaster", sourceField: "headquartersName" },
      { key: "product", label: "Product", sourceMaster: "productMaster", sourceField: "productName" },
      { key: "stockist", label: "Stockist", sourceMaster: "stockistMaster", sourceField: "stockistName" },
      { key: "claimDate", label: "Claim Date", type: "date" },
      { key: "claimType", label: "Claim Type", options: ["Scheme", "Damage", "Expiry", "Rate Difference", "Other"] },
      { key: "claimQuantity", label: "Claim Quantity", type: "number" },
      { key: "claimValue", label: "Claim Value", type: "number" },
      { key: "claimStatus", label: "Claim Status", options: ["Approved", "Pending", "Rejected"] },
      { key: "remarks", label: "Remarks" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  // IMS is confirmed in the transcript only as the fifth Sales button — its
  // field list was explicitly left undefined ("the transcript only mentions
  // IMS as a module; it does not define its complete field list"). This
  // gives it the same organizational/product/month hierarchy every other
  // Sales button shares, without inventing undocumented fields.
  {
    key: "imsMaster",
    title: "IMS",
    keyFields: ["division", "hq", "product", "month"],
    fields: [
      { key: "division", label: "Division", sourceMaster: "divisionMaster", sourceField: "divisionName" },
      { key: "zone", label: "Zone", sourceMaster: "regionZoneMaster", sourceField: "zoneName" },
      { key: "region", label: "Region", sourceMaster: "regionZoneMaster", sourceField: "regionName" },
      { key: "area", label: "Area", sourceMaster: "areaMaster", sourceField: "areaName" },
      { key: "hq", label: "HQ", sourceMaster: "territoryHqMaster", sourceField: "headquartersName" },
      { key: "product", label: "Product", sourceMaster: "productMaster", sourceField: "productName" },
      { key: "month", label: "Month" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    // Live-verified against sanpharma.info (Activities » Approvals » Listed
    // Dr Addition), 2026-09-21: headers are exactly S.No | SF Name | HQ |
    // Click Here (S.No is a rendered row index, not a stored field). No
    // pending record was up on the live site to screenshot directly, but
    // this screen is the sibling of Listed Dr Deactivation below (same
    // underlying approval template, confirmed via that screen's live data),
    // so it carries the identical shape.
    // Live-verified list columns: S.No | SF Name | HQ | Click Here. The
    // sanpharma "Click Here to Approve" link on this screen opens a page
    // listing the actual DOCTORS this SF Name is requesting to add (S.No |
    // Listed Doctor Name | Speciality | Category | Qualification | Class |
    // Territory) -- so the request also needs to carry which doctor it's
    // about, sourced straight from Doctor Master / Doctor Classification
    // the same way every other SF-Name-driven computed column works here.
    key: "approvalListedDrAddition",
    title: "Listed Dr Addition",
    uiKind: "approvalQueue",
    keyFields: ["sfName", "hq"],
    fields: [
      { key: "sfName", label: "SF Name", sourceMaster: "employees", sourceField: "name" },
      { key: "hq", label: "HQ", computed: { fromField: "sfName", sourceMaster: "employees", lookupField: "name", displayField: "territory" } },
      { key: "doctorCode", label: "Listed Doctor Name", sourceMaster: "doctorMaster", sourceField: "doctorCode", detailOnly: true },
      { key: "speciality", label: "Speciality", computed: { fromField: "doctorCode", sourceMaster: "doctorMaster", lookupField: "doctorCode", displayField: "specialty" }, detailOnly: true },
      { key: "category", label: "Category", computed: { fromField: "doctorCode", sourceMaster: "doctorClassification", lookupField: "doctorCode", displayField: "doctorCategory" }, detailOnly: true },
      { key: "qualification", label: "Qualification", computed: { fromField: "doctorCode", sourceMaster: "doctorMaster", lookupField: "doctorCode", displayField: "qualification" }, detailOnly: true },
      { key: "classField", label: "Class", computed: { fromField: "doctorCode", sourceMaster: "doctorClassification", lookupField: "doctorCode", displayField: "potential" }, detailOnly: true },
      { key: "territory", label: "Territory", computed: { fromField: "sfName", sourceMaster: "employees", lookupField: "name", displayField: "territory" }, detailOnly: true },
      { key: "approvalStatus", label: "Approval Status", options: ["Pending", "Approved", "Rejected"] }
    ]
  },
  {
    // Live-verified against sanpharma.info (Activities » Approvals » Listed
    // Dr Deactivation), 2026-09-21 — exact live row: "1 | RAJAN SHARMA BE |
    // AMRITSAR | Click Here to Approve". Headers: S.No | SF Name | HQ |
    // Click Here.
    key: "approvalListedDrDeactivation",
    title: "Listed Dr Deactivation",
    uiKind: "approvalQueue",
    keyFields: ["sfName", "hq"],
    fields: [
      { key: "sfName", label: "SF Name", sourceMaster: "employees", sourceField: "name" },
      { key: "hq", label: "HQ", computed: { fromField: "sfName", sourceMaster: "employees", lookupField: "name", displayField: "territory" } },
      { key: "doctorCode", label: "Listed Doctor Name", sourceMaster: "doctorMaster", sourceField: "doctorCode", detailOnly: true },
      { key: "speciality", label: "Speciality", computed: { fromField: "doctorCode", sourceMaster: "doctorMaster", lookupField: "doctorCode", displayField: "specialty" }, detailOnly: true },
      { key: "category", label: "Category", computed: { fromField: "doctorCode", sourceMaster: "doctorClassification", lookupField: "doctorCode", displayField: "doctorCategory" }, detailOnly: true },
      { key: "qualification", label: "Qualification", computed: { fromField: "doctorCode", sourceMaster: "doctorMaster", lookupField: "doctorCode", displayField: "qualification" }, detailOnly: true },
      { key: "classField", label: "Class", computed: { fromField: "doctorCode", sourceMaster: "doctorClassification", lookupField: "doctorCode", displayField: "potential" }, detailOnly: true },
      { key: "territory", label: "Territory", computed: { fromField: "sfName", sourceMaster: "employees", lookupField: "name", displayField: "territory" }, detailOnly: true },
      { key: "approvalStatus", label: "Approval Status", options: ["Pending", "Approved", "Rejected"] }
    ]
  },
  {
    // NOT YET LIVE-CONFIRMED: sanpharma.info's TP (Tour Plan) approval queue
    // had zero pending requests during the 2026-09-21 crawl, so no header
    // row could be screenshotted. This mirrors the confirmed DCR shape
    // below (same manager-approval template family) as a best-effort
    // placeholder — replace with the exact columns as soon as a live
    // pending Tour Plan approval can be inspected.
    key: "approvalTp",
    title: "TP Approval",
    uiKind: "approvalQueue",
    keyFields: ["sfName", "hq"],
    fields: [
      { key: "sfName", label: "SF Name", sourceMaster: "employees", sourceField: "name" },
      { key: "hq", label: "HQ", computed: { fromField: "sfName", sourceMaster: "employees", lookupField: "name", displayField: "territory" } },
      { key: "designation", label: "Designation", computed: { fromField: "sfName", sourceMaster: "employees", lookupField: "name", displayField: "designation" } },
      // Detail-only -- shown on "Click Here to Approve" (same shape as the
      // Manager Portal's own Tour Plan review: TP ID / Month / Target
      // Locations / Manager), not on the outer pending-request list.
      { key: "tpId", label: "TP ID", detailOnly: true },
      { key: "month", label: "Month", detailOnly: true },
      { key: "targetLocations", label: "Target Locations", detailOnly: true },
      { key: "managerName", label: "Manager (ABM)", detailOnly: true },
      { key: "approvalStatus", label: "Approval Status", options: ["Pending", "Approved", "Rejected"] }
    ],
    approvalActionColumnLabel: "Approve",
    approvalLinkText: "Click here to Approve",
    approvalLinkDateSuffix: true
  },
  {
    // Live-verified against sanpharma.info (Activities » Approvals » DCR),
    // 2026-09-21 — exact live rows: "1 | MAHESH YADAV | MUMBAI | ZBM | Click
    // here to Approve Sep 2026" and "2 | ARUN KUMAR BOSE | BANGALORE | RBM |
    // Click here to Approve Sep 2026". Headers: S.No | SF Name | HQ |
    // Designation | Approve. The action link text carries a live
    // month/year suffix (approvalLinkDateSuffix).
    key: "approvalDcr",
    title: "DCR Approval",
    uiKind: "approvalQueue",
    keyFields: ["sfName", "hq"],
    fields: [
      { key: "sfName", label: "SF Name", sourceMaster: "employees", sourceField: "name" },
      { key: "hq", label: "HQ", computed: { fromField: "sfName", sourceMaster: "employees", lookupField: "name", displayField: "territory" } },
      { key: "designation", label: "Designation", computed: { fromField: "sfName", sourceMaster: "employees", lookupField: "name", displayField: "designation" } },
      // Detail-only -- shown on "Click Here to Approve". sanpharma's own
      // DCR_Bulk_Approval.aspx groups a WHOLE MONTH of an MR's visit-level
      // DCR rows (one row per activity date) into a single approve/reject
      // grid with per-row Approve/Reject checkboxes -- that's a materially
      // bigger feature (grouping many DCR submissions into one review
      // page) than a single request's detail popup. This surfaces the real
      // fields from the single DCR submission that triggered this request
      // as an interim step; the full multi-date grid is tracked as a
      // separate follow-up.
      { key: "activityDate", label: "Activity Date", type: "date", detailOnly: true },
      { key: "workType", label: "Work Type", detailOnly: true },
      { key: "hospitalClinic", label: "Hospitals Met", detailOnly: true },
      { key: "remarks", label: "Remarks", detailOnly: true },
      { key: "approvalStatus", label: "Approval Status", options: ["Pending", "Approved", "Rejected"] }
    ],
    approvalActionColumnLabel: "Approve",
    approvalLinkText: "Click here to Approve",
    approvalLinkDateSuffix: true
  },
  {
    // Live-verified against sanpharma.info (Activities » Approvals »
    // Leave), 2026-09-21 — exact live rows: "1 | MAHESH YADAV | ZBM | MUMBAI
    // | E0065 | 16/09/2026 | 16/09/2026 | 1 | Click Here to Approve" and
    // "2 | ARUN KUMAR BOSE | RBM | BANGALORE | E0178 | 15/09/2026 |
    // 15/09/2026 | 1 | Click Here to Approve". Headers: S.No | FieldForce
    // Name | Designation | HQ | Emp.Code | From Date | To Date | Leave Days
    // | Click Here.
    key: "approvalLeave",
    title: "Leave Approval",
    uiKind: "approvalQueue",
    keyFields: ["fieldForceName", "fromDate"],
    fields: [
      { key: "fieldForceName", label: "FieldForce Name", sourceMaster: "employees", sourceField: "name" },
      { key: "designation", label: "Designation", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "designation" } },
      { key: "hq", label: "HQ", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "territory" } },
      { key: "empCode", label: "Emp.Code", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "employeeCode" } },
      { key: "fromDate", label: "From Date", type: "date" },
      { key: "toDate", label: "To Date", type: "date" },
      { key: "leaveDays", label: "Leave Days", type: "number" },
      // Detail-only -- shown on "Click Here to Approve", matching
      // sanpharma.info's own Leave Application Form (Type of Leave /
      // Reason For Leave), not the outer pending-request list.
      { key: "leaveType", label: "Type of Leave", detailOnly: true },
      { key: "reasonForLeave", label: "Reason For Leave", detailOnly: true },
      { key: "division", label: "Division Name", detailOnly: true },
      { key: "approvalStatus", label: "Approval Status", options: ["Pending", "Approved", "Rejected"] }
    ]
  },
  {
    // EXACT live-confirmed headers from sanpharma.info "Expense Approval (Active)"
    // (crawled 2026-09-21, Field Force picker + Month/Year + Go flow):
    // Emp Code | Fieldforce Name | Designation | Head Quater | Region | State |
    // Sub Division | Status | Submission Date | Mgr Approval Date |
    // Admin Approval Date | DA | Fare | INTERNET | MOBILE ALLOWANCES |
    // VEHICLE ALLOWANCES | Miscellaneous | Additional Expense | + | - |
    // Claimed Amount(By MR) | Approved Amount(By Admin)
    key: "expenseApprovalActive",
    title: "Expense Approval (Active)",
    uiKind: "reportFilter",
    keyFields: ["fieldForceName", "month", "year"],
    fields: [
      { key: "fieldForceName", label: "Fieldforce Name", sourceMaster: "employees", sourceField: "name" },
      { key: "empCode", label: "Emp Code", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "employeeCode" } },
      { key: "designation", label: "Designation", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "designation" } },
      { key: "hq", label: "Head Quater", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "territory" } },
      { key: "region", label: "Region" },
      { key: "state", label: "State" },
      { key: "subDivision", label: "Sub Division" },
      { key: "month", label: "Month" },
      { key: "year", label: "Year" },
      { key: "status", label: "Status", options: ["Pending", "Approved", "Rejected"] },
      { key: "submissionDate", label: "Submission Date", type: "date" },
      { key: "mgrApprovalDate", label: "Mgr Approval Date", type: "date" },
      { key: "adminApprovalDate", label: "Admin Approval Date", type: "date" },
      { key: "da", label: "DA", type: "number" },
      { key: "fare", label: "Fare", type: "number" },
      { key: "internet", label: "INTERNET", type: "number" },
      { key: "mobileAllowances", label: "MOBILE ALLOWANCES", type: "number" },
      { key: "vehicleAllowances", label: "VEHICLE ALLOWANCES", type: "number" },
      { key: "miscellaneous", label: "Miscellaneous", type: "number" },
      { key: "additionalExpense", label: "Additional Expense", type: "number" },
      { key: "plusAmount", label: "+", type: "number" },
      { key: "minusAmount", label: "-", type: "number" },
      { key: "claimedAmount", label: "Claimed Amount(By MR)", type: "number" },
      { key: "approvedAmount", label: "Approved Amount(By Admin)", type: "number" }
    ]
  },
  {
    // EXACT live-confirmed headers from sanpharma.info "Expense Approval (Vacant/Resigned)"
    // (crawled 2026-09-21, Field Force picker + Month/Year + Go flow):
    // Employee ID | Fieldforce Name | Head Quater | Designation | DCR Start Date |
    // DCR end Date | Status | Submission Date | DA | INTERNET | MOBILE ALLOWANCES |
    // VEHICLE ALLOWANCES | Miscellaneous | + | - | Claimed Amount(By MR) |
    // Approved Amount(By Admin)
    key: "expenseApprovalVacantResigned",
    title: "Expense Approval (Vacant/Resigned)",
    uiKind: "reportFilter",
    keyFields: ["fieldForceName", "month", "year"],
    fields: [
      { key: "fieldForceName", label: "Fieldforce Name", sourceMaster: "employees", sourceField: "name" },
      { key: "employeeId", label: "Employee ID", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "employeeCode" } },
      { key: "hq", label: "Head Quater", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "territory" } },
      { key: "designation", label: "Designation", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "designation" } },
      { key: "dcrStartDate", label: "DCR Start Date", type: "date" },
      { key: "dcrEndDate", label: "DCR end Date", type: "date" },
      { key: "month", label: "Month" },
      { key: "year", label: "Year" },
      { key: "status", label: "Status", options: ["Pending", "Approved", "Rejected"] },
      { key: "submissionDate", label: "Submission Date", type: "date" },
      { key: "da", label: "DA", type: "number" },
      { key: "internet", label: "INTERNET", type: "number" },
      { key: "mobileAllowances", label: "MOBILE ALLOWANCES", type: "number" },
      { key: "vehicleAllowances", label: "VEHICLE ALLOWANCES", type: "number" },
      { key: "miscellaneous", label: "Miscellaneous", type: "number" },
      { key: "plusAmount", label: "+", type: "number" },
      { key: "minusAmount", label: "-", type: "number" },
      { key: "claimedAmount", label: "Claimed Amount(By MR)", type: "number" },
      { key: "approvedAmount", label: "Approved Amount(By Admin)", type: "number" }
    ]
  },
  {
    key: "activitiesExpenseAnalysis",
    title: "Expense Analysis",
    uiKind: "reportFilter",
    keyFields: ["fieldForceName", "month", "year"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "month", label: "Month" },
      { key: "year", label: "Year" },
      { key: "remarks", label: "Remarks" },
      { key: "status", label: "Status", options: ["Active", "Inactive"] }
    ]
  },
  {
    key: "activitiesExpenseConsolidatedView",
    title: "Expense Consolidated View",
    uiKind: "reportFilter",
    keyFields: ["fieldForceName", "month", "year"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "month", label: "Month" },
      { key: "year", label: "Year" },
      { key: "remarks", label: "Remarks" },
      { key: "status", label: "Status", options: ["Active", "Inactive"] }
    ]
  },
  {
    // Best-effort field set from sanpharma.info notes: "Sample Despatch >
    // View" (sampleproduct.aspx) filters by Fieldforce Name + From/To
    // Month-Year range to show samples despatched to that rep in the
    // period. Result columns not live-confirmed (automation blockage).
    key: "sampleDispatchView",
    title: "Sample Dispatch - View",
    uiKind: "reportFilter",
    keyFields: ["fieldForceName", "fromMonth", "toMonth"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "fromMonth", label: "From Month" },
      { key: "fromYear", label: "From Year" },
      { key: "toMonth", label: "To Month" },
      { key: "toYear", label: "To Year" },
      { key: "productName", label: "Product Name" },
      { key: "quantity", label: "Quantity", type: "number" },
      { key: "despatchDate", label: "Despatch Date", type: "date" },
      { key: "remarks", label: "Remarks" }
    ]
  },
  {
    // Best-effort field set from sanpharma.info notes: "Sample Despatch >
    // Status" (samplestatus_New.aspx) filters by Fieldforce Name + From/To
    // Month-Year range to show delivery/acknowledgement status of that
    // despatch. Result columns not live-confirmed (automation blockage).
    key: "sampleDispatchStatus",
    title: "Sample Dispatch - Status",
    uiKind: "reportFilter",
    keyFields: ["fieldForceName", "fromMonth", "toMonth"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "fromMonth", label: "From Month" },
      { key: "fromYear", label: "From Year" },
      { key: "toMonth", label: "To Month" },
      { key: "toYear", label: "To Year" },
      { key: "despatchDate", label: "Despatch Date", type: "date" },
      { key: "acknowledgedDate", label: "Acknowledged Date", type: "date" },
      { key: "status", label: "Status", options: ["Pending", "Delivered", "Acknowledged"] }
    ]
  },
  {
    // Best-effort field set from sanpharma.info notes: "Input Despatch >
    // View" (inputproduct.aspx) — identical pattern to Sample Despatch,
    // for promotional Input items instead of drug samples. Result columns
    // not live-confirmed (automation blockage).
    key: "inputDispatchView",
    title: "Input Dispatch - View",
    uiKind: "reportFilter",
    keyFields: ["fieldForceName", "fromMonth", "toMonth"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "fromMonth", label: "From Month" },
      { key: "fromYear", label: "From Year" },
      { key: "toMonth", label: "To Month" },
      { key: "toYear", label: "To Year" },
      { key: "itemName", label: "Item Name" },
      { key: "quantity", label: "Quantity", type: "number" },
      { key: "despatchDate", label: "Despatch Date", type: "date" },
      { key: "remarks", label: "Remarks" }
    ]
  },
  {
    // Best-effort field set from sanpharma.info notes: "Input Despatch >
    // Status" (Inputstatus_New.aspx) — identical pattern to Sample Despatch
    // Status, for promotional Input items. Result columns not
    // live-confirmed (automation blockage).
    key: "inputDispatchStatus",
    title: "Input Dispatch - Status",
    uiKind: "reportFilter",
    keyFields: ["fieldForceName", "fromMonth", "toMonth"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "fromMonth", label: "From Month" },
      { key: "fromYear", label: "From Year" },
      { key: "toMonth", label: "To Month" },
      { key: "toYear", label: "To Year" },
      { key: "despatchDate", label: "Despatch Date", type: "date" },
      { key: "acknowledgedDate", label: "Acknowledged Date", type: "date" },
      { key: "status", label: "Status", options: ["Pending", "Delivered", "Acknowledged"] }
    ]
  },
  {
    // Best-effort field set from sanpharma.info notes: "MSIS View"
    // (MSIS_View.aspx) filters by Fieldforce Name + From Month/Year + a
    // Report Type toggle (Monthwise / Periodically) -> Monthly Sales
    // Information Statement report. Result columns not live-confirmed
    // (automation blockage). Report Type modeled via the generic "mode"
    // filter field.
    key: "msisView",
    title: "MSIS - View",
    uiKind: "reportFilter",
    keyFields: ["fieldForceName", "fromMonth", "fromYear", "mode"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "fromMonth", label: "From Month" },
      { key: "fromYear", label: "From Year" },
      { key: "mode", label: "Report Type", options: ["Monthwise", "Periodically"] },
      { key: "productName", label: "Product Name" },
      { key: "sales", label: "Sales", type: "number" },
      { key: "remarks", label: "Remarks" }
    ]
  },
  {
    // NOT YET LIVE-CONFIRMED with exact result columns -- sanpharma.info's
    // "Leave Entitlement > Entry" (ActivityReports/Leave_Entitlement_New.aspx)
    // filters by Fieldforce Name + Year to set that employee's annual leave
    // entitlement. Best-effort field set based on standard Indian leave
    // types (CL/PL/SL/LOP) used elsewhere on the live site (Leave Setup).
    // Live-verified against sanpharma.info (Master » Leave Entitlement -
    // Entry): S.No | Field Force Name | HQ | Designation | Employee Code |
    // Date of Joining | Leave Balance (CL/PL/SL/LOP) | Leave Eligibility
    // (CL/PL/SL/LOP) -- two separate groups of the same four leave types,
    // Balance being what's left and Eligibility the yearly entitlement the
    // admin sets.
    key: "leaveEntitlementEntry",
    title: "Leave Entitlement - Entry",
    uiKind: "reportFilter",
    keyFields: ["fieldForceName", "year"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "hq", label: "HQ", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "territory" } },
      { key: "designation", label: "Designation", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "designation" } },
      { key: "employeeCode", label: "Employee Code", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "employeeCode" } },
      { key: "dateOfJoining", label: "Date of Joining", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "joinDate" } },
      { key: "year", label: "Year" },
      { key: "balanceCl", label: "Balance CL", type: "number" },
      { key: "balancePl", label: "Balance PL", type: "number" },
      { key: "balanceSl", label: "Balance SL", type: "number" },
      { key: "balanceLop", label: "Balance LOP", type: "number" },
      { key: "cl", label: "Eligibility CL", type: "number" },
      { key: "pl", label: "Eligibility PL", type: "number" },
      { key: "sl", label: "Eligibility SL", type: "number" },
      { key: "lop", label: "Eligibility LOP", type: "number" }
    ]
  },
  {
    // NOT YET LIVE-CONFIRMED with exact result columns -- sanpharma.info's
    // "Leave Entitlement > View" (ActivityReports/Leave_Entitleent_view.aspx,
    // titled "Leave Status View") filters by Fieldforce Name + From/To Month
    // to show leave taken/balance for the period. Best-effort field set.
    // Live-verified against sanpharma.info (Activity Reports » Leave Status
    // View / Leave Entitlement View): S.No | Employee id | FieldForce Name |
    // Designation | HQ | Joining Date | Leave Eligibility (CL/PL/SL/LOP) |
    // <selected month> Leave Taken (CL/PL/SL/LOP) | Leave Balance
    // (CL/PL/SL/LOP), filtered by Field Force Name + From/To Month-Year.
    key: "leaveEntitlementView",
    title: "Leave Entitlement - View",
    uiKind: "reportFilter",
    keyFields: ["fieldForceName", "fromMonth", "toMonth"],
    fields: [
      { key: "employeeId", label: "Employee id", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "employeeCode" } },
      { key: "fieldForceName", label: "FieldForce Name", sourceMaster: "employees", sourceField: "name" },
      { key: "designation", label: "Designation", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "designation" } },
      { key: "hq", label: "HQ", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "territory" } },
      { key: "joiningDate", label: "Joining Date", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "joinDate" } },
      { key: "fromMonth", label: "From Month" },
      { key: "fromYear", label: "From Year" },
      { key: "toMonth", label: "To Month" },
      { key: "toYear", label: "To Year" },
      { key: "eligibilityCl", label: "Eligibility CL", type: "number" },
      { key: "eligibilityPl", label: "Eligibility PL", type: "number" },
      { key: "eligibilitySl", label: "Eligibility SL", type: "number" },
      { key: "eligibilityLop", label: "Eligibility LOP", type: "number" },
      { key: "takenCl", label: "Leave Taken CL", type: "number" },
      { key: "takenPl", label: "Leave Taken PL", type: "number" },
      { key: "takenSl", label: "Leave Taken SL", type: "number" },
      { key: "takenLop", label: "Leave Taken LOP", type: "number" },
      { key: "balanceCl", label: "Balance CL", type: "number" },
      { key: "balancePl", label: "Balance PL", type: "number" },
      { key: "balanceSl", label: "Balance SL", type: "number" },
      { key: "balanceLop", label: "Balance LOP", type: "number" }
    ]
  },
  {
    // NOT YET LIVE-CONFIRMED with exact result columns (JS execution was
    // blocked by a picker popup mid-crawl) -- sanpharma.info's "Audit Report"
    // (ActivityReports/Audit_View.aspx) filters by Filed Force Name (226
    // entries, includes inactive/resigned) + Month + Year + a Mode dropdown
    // with 11 tracked report-access types (All, Call Average, Missed Call,
    // Doctorwise Periodically, Analysis-DCR, Coverage Analysis, Secondary
    // Sale, Tour Plan, DCR View, Product Exposure Analysis, Sample Issued
    // FieldForce) -- it's a report-access audit trail. Best-effort field set.
    // Live-verified against sanpharma.info (Manager_Audit_Report.aspx):
    // S No | Login FieldForce Name | Emp Id | Mode of Report | Selected
    // Month | Viewed On | Selected Fieldforce -- a log of which manager
    // viewed which report, for which fieldforce/month, and when.
    key: "auditReport",
    title: "Audit Report",
    uiKind: "reportFilter",
    keyFields: ["fieldForceName", "month", "year", "mode"],
    fields: [
      { key: "fieldForceName", label: "Login FieldForce Name", sourceMaster: "employees", sourceField: "name" },
      { key: "empId", label: "Emp Id", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "employeeCode" } },
      { key: "mode", label: "Mode of Report", options: ["All", "Call Average", "Missed Call", "Doctorwise Periodically", "Analysis-DCR", "Coverage Analysis", "Secondary Sale", "Tour Plan", "DCR View", "Product Exposure Analysis", "Sample Issued FieldForce"] },
      { key: "month", label: "Selected Month" },
      { key: "year", label: "Year" },
      { key: "viewedOn", label: "Viewed On", type: "date" },
      { key: "selectedFieldforce", label: "Selected Fieldforce", sourceMaster: "employees", sourceField: "name" }
    ]
  },
  {
    // sanpharma.info's live "Order Booking View" (MR/Order_Booking_View.aspx)
    // throws an unhandled ASP.NET server error for this account ("'ddlStock'
    // has a SelectedValue which is invalid...", Order_Booking_View.aspx.cs
    // line 186) -- a confirmed defect in the third-party product itself, not
    // something to replicate. Using reasonable, non-buggy Order Booking
    // report columns instead, consistent with the Order Booking Setup
    // module (MasterFiles/Order_booking_setuppage.aspx) seen elsewhere.
    key: "orderBookingView",
    title: "Order Booking - View",
    uiKind: "reportFilter",
    keyFields: ["fieldForceName", "month", "year"],
    fields: [
      { key: "fieldForceName", label: "Fieldforce Name", sourceMaster: "employees", sourceField: "name" },
      { key: "month", label: "Month" },
      { key: "year", label: "Year" },
      { key: "orderDate", label: "Order Date", type: "date" },
      { key: "stockistName", label: "Stockist Name" },
      { key: "productName", label: "Product Name" },
      { key: "quantity", label: "Quantity", type: "number" },
      { key: "orderValue", label: "Order Value", type: "number" },
      { key: "status", label: "Status", options: ["Pending", "Confirmed", "Delivered", "Cancelled"] }
    ]
  },
  {
    // Best-effort field set from sanpharma.info notes: "Login Details"
    // (Login_Details.aspx) filters by Filed Force (226) + Month + Year +
    // "Without Vacant" / "Not logged in more than N days" -> a
    // login-compliance/inactivity report. Result columns not
    // live-confirmed (automation blockage).
    key: "loginDetailsManager",
    title: "Login Details - Manager",
    uiKind: "reportFilter",
    keyFields: ["fieldForceName", "month", "year"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "month", label: "Month" },
      { key: "year", label: "Year" },
      { key: "lastLoginDate", label: "Last Login Date", type: "date" },
      { key: "daysSinceLogin", label: "Days Since Login", type: "number" },
      { key: "status", label: "Status", options: ["Active", "Inactive"] }
    ]
  },
  {
    // Same pattern as Login Details > Manager (Login_Details.aspx) --
    // sanpharma.info doesn't distinguish the two by a different result
    // shape, only by which Field Force subset is shown.
    key: "loginDetailsFieldrepo",
    title: "Login Details - Fieldrepo",
    uiKind: "reportFilter",
    keyFields: ["fieldForceName", "month", "year"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "month", label: "Month" },
      { key: "year", label: "Year" },
      { key: "lastLoginDate", label: "Last Login Date", type: "date" },
      { key: "daysSinceLogin", label: "Days Since Login", type: "number" },
      { key: "status", label: "Status", options: ["Active", "Inactive"] }
    ]
  },
  {
    key: "loginIntoFieldforce",
    title: "Login Into Fieldforce",
    keyFields: ["fieldForceName", "performedDate"],
    fields: [
      { key: "referenceId", label: "Reference / Record" },
      { key: "performedBy", label: "Performed By", sourceMaster: "employees", sourceField: "name" },
      { key: "performedDate", label: "Performed Date", type: "date" },
      { key: "remarks", label: "Remarks" },
      { key: "status", label: "Status", options: ["Pending", "Completed"] }
    ]
  },
  {
    key: "taskModeCreation",
    title: "Task Management - Mode Creation",
    keyFields: ["shortName"],
    fields: [
      { key: "shortName", label: "Short Name" },
      { key: "taskName", label: "Task Name" },
      { key: "status", label: "Status", options: ["Active", "Inactive"] }
    ]
  },
  {
    key: "taskAssign",
    title: "Task Management - Task Assign",
    keyFields: ["fieldForceName", "task"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "task", label: "Task" },
      { key: "dueDate", label: "Due Date", type: "date" },
      { key: "status", label: "Status", options: ["New", "Pending", "Completed", "Closed", "ReOpen", "On Hold"] },
      { key: "remarks", label: "Remarks" }
    ]
  },
  {
    key: "activityMasterScreenCreation",
    title: "Activity - Master & Screen Creation",
    keyFields: ["shortName"],
    fields: [
      { key: "shortName", label: "Activity Short Name" },
      { key: "activityName", label: "Activity Name" },
      { key: "mode", label: "Mode", options: ["MR", "MGR", "MR & MGR"] },
      { key: "forField", label: "For" },
      { key: "status", label: "Status", options: ["Active", "Inactive"] }
    ]
  },
  {
    // Best-effort field set from sanpharma.info notes: "Activity > Status"
    // (Activity_Master_Creation_Status.aspx, titled "DCR Activity Status")
    // filters by Filed Force Name + Mode (Common Activity /
    // Drs-Chm-Stk-UnlstDrs-Hos-CIP) + Month + Year -> completion status of
    // custom activities. Result columns not live-confirmed.
    key: "activityStatus",
    title: "Activity - Status",
    uiKind: "reportFilter",
    keyFields: ["fieldForceName", "mode", "month", "year"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "mode", label: "Mode", options: ["Common Activity", "Doctors", "Chemist", "Stockist", "Unlisted Doctors", "Hospital", "CIP"] },
      { key: "month", label: "Month" },
      { key: "year", label: "Year" },
      { key: "activityName", label: "Activity Name" },
      { key: "status", label: "Status", options: ["Completed", "Pending"] }
    ]
  },
  {
    // Live-verified against sanpharma.info (Master » Manager Missed Call -
    // Setup): SNO | Manager Name | HQ | Design | Base Level Tagging, where
    // HQ/Design are read off the picked Manager (same computed-field
    // pattern as every other SF-Name-driven screen) and Base Level Tagging
    // is itself another employee picked from a dropdown (the manager this
    // row's missed calls escalate to), not free text.
    key: "managerMissedCallSetup",
    title: "Manager Missed Call - Setup",
    keyFields: ["managerName"],
    fields: [
      { key: "managerName", label: "Manager Name", sourceMaster: "employees", sourceField: "name" },
      { key: "hq", label: "HQ", computed: { fromField: "managerName", sourceMaster: "employees", lookupField: "name", displayField: "territory" } },
      { key: "designation", label: "Design", computed: { fromField: "managerName", sourceMaster: "employees", lookupField: "name", displayField: "designation" } },
      { key: "baseLevelTagging", label: "Base Level Tagging", sourceMaster: "employees", sourceField: "name" },
      { key: "status", label: "Status", options: ["Active", "Inactive"] }
    ]
  },
  {
    key: "managerMissedCallView",
    title: "Manager Missed Call - View",
    uiKind: "reportFilter",
    keyFields: ["managerName", "month", "year"],
    fields: [
      { key: "managerName", label: "Manager Name", sourceMaster: "employees", sourceField: "name" },
      { key: "month", label: "Month" },
      { key: "year", label: "Year" },
      { key: "missedCallCount", label: "Missed Call Count", type: "number" }
    ]
  },
  {
    key: "optionsDashboardWidget",
    title: "Options - Dashboard",
    keyFields: ["name"],
    fields: [
      { key: "name", label: "Name" },
      { key: "value", label: "Value" },
      { key: "description", label: "Description" },
      { key: "status", label: "Status", options: ["Active", "Inactive"] }
    ]
  },
  {
    key: "optionsChangePassword",
    title: "Change Password",
    uiKind: "changePassword",
    keyFields: ["fieldForceName", "lastChangedOn"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "lastChangedOn", label: "Last Changed On", type: "date" },
      { key: "changedBy", label: "Changed By" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "vacantMrLoginAccess",
    title: "Vacant MR Login - Access",
    uiKind: "vacantMrLogin",
    keyFields: ["fieldForceName"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "loginTo", label: "Login To", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "designation" } },
      { key: "lastAccessedOn", label: "Last Accessed On", type: "date" },
      { key: "accessedBy", label: "Accessed By" }
    ]
  },
  {
    key: "vacantMrLoginPermission",
    title: "Vacant MR Login - Permission for MR",
    keyFields: ["userName"],
    fields: [
      { key: "userName", label: "User Name", sourceMaster: "employees", sourceField: "name" },
      { key: "fieldForceType", label: "Field Force Type", options: ["Team", "Advanced"] },
      { key: "grantedOn", label: "Granted On", type: "date" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "doctorCampaignMap",
    title: "Doctor - Campaign Map",
    keyFields: ["doctorCode"],
    fields: [
      { key: "doctorCode", label: "Doctor Code", sourceMaster: "doctorMaster", sourceField: "doctorCode" },
      { key: "doctorName", label: "Doctor Name", computed: { fromField: "doctorCode", sourceMaster: "doctorMaster", lookupField: "doctorCode", displayField: "doctorName" } },
      { key: "qualification", label: "Qualification", computed: { fromField: "doctorCode", sourceMaster: "doctorMaster", lookupField: "doctorCode", displayField: "qualification" } },
      { key: "speciality", label: "Speciality", computed: { fromField: "doctorCode", sourceMaster: "doctorMaster", lookupField: "doctorCode", displayField: "specialty" } },
      { key: "category", label: "Category", computed: { fromField: "doctorCode", sourceMaster: "doctorClassification", lookupField: "doctorCode", displayField: "doctorCategory" } },
      { key: "territory", label: "Territory" },
      { key: "campaignSubCategory", label: "Campaign Sub Category" },
      { key: "hq", label: "HQ", sourceMaster: "territoryHqMaster", sourceField: "headquartersName" }
    ]
  },
  {
    key: "tpDeleteSetup",
    title: "TP Delete",
    keyFields: ["fieldForceName", "tourMonth", "tourYear"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "designation", label: "Designation", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "designation" } },
      { key: "hq", label: "HQ", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "territory" } },
      { key: "tourMonth", label: "Tour Month", type: "number" },
      { key: "tourYear", label: "Tour Year" },
      { key: "lastMonthTp", label: "Last Month TP" }
    ]
  },
  {
    key: "dcrEditSetup",
    title: "DCR Edit",
    keyFields: ["fieldForceName", "dcrDate"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "dcrDate", label: "DCR Date", type: "date" },
      { key: "workType", label: "Work Type", options: ["Field Work", "Holiday", "Weekly Off", "Transit", "Meeting"] }
    ]
  },
  {
    key: "msisEditApproval",
    title: "MSIS Edit (Approval)",
    keyFields: ["fieldForceName", "month", "year"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "month", label: "Month" },
      { key: "year", label: "Year" },
      { key: "status", label: "Status", options: ["Pending", "Reviewed"] }
    ]
  },
  {
    key: "mailDeleteLog",
    title: "Mail Delete",
    keyFields: ["fieldForceName", "deletedOn"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "month", label: "Month" },
      { key: "year", label: "Year" },
      { key: "searchBy", label: "Search By", options: ["Inbox", "Viewed", "Sent"] },
      { key: "subject", label: "Subject" },
      { key: "deletedOn", label: "Deleted On", type: "date" }
    ]
  },
  {
    key: "leaveCancellation",
    title: "Leave Cancellation (After Approval)",
    keyFields: ["fieldForceName", "fromDate"],
    fields: [
      { key: "employeeId", label: "Employee Id", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "employeeCode" } },
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "hq", label: "HQ", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "territory" } },
      { key: "designation", label: "Designation", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "designation" } },
      { key: "leaveAppliedDate", label: "Leave Applied Date", type: "date" },
      { key: "fromDate", label: "From Date", type: "date" },
      { key: "toDate", label: "To Date", type: "date" },
      { key: "noOfDays", label: "No of Days", type: "number" },
      { key: "approvedBy", label: "Approved By" }
    ]
  },
  {
    key: "deviceIdDeletion",
    title: "Mobile App - Device Id Deletion",
    keyFields: ["fieldForceName", "deviceId"],
    fields: [
      { key: "employeeId", label: "Employee Id", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "employeeCode" } },
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "hq", label: "HQ", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "territory" } },
      { key: "designation", label: "Designation", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "designation" } },
      { key: "deviceId", label: "Device Id" },
      { key: "status", label: "Status", options: ["Bound", "Unbound"] }
    ]
  },
  {
    key: "tpDeviationRelease",
    title: "TP Deviation - Release",
    keyFields: ["fieldForceName", "month", "year"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "month", label: "Month" },
      { key: "year", label: "Year" },
      { key: "status", label: "Status", options: ["Locked", "Released"] }
    ]
  },
  {
    key: "drUniqueNoGeneration",
    title: "Drs UNI No - Generation",
    keyFields: ["doctorCode"],
    fields: [
      { key: "doctorCode", label: "Doctor Code", sourceMaster: "doctorMaster", sourceField: "doctorCode" },
      { key: "doctorName", label: "Doctor Name", computed: { fromField: "doctorCode", sourceMaster: "doctorMaster", lookupField: "doctorCode", displayField: "doctorName" } },
      { key: "mode", label: "Mode", options: ["All Listed Drs", "Specialty Wise", "Subdivision - HQ Wise"] },
      { key: "uniqueSlNo", label: "Unique Sl No" },
      { key: "allocated", label: "Allocated", options: ["Yes", "No"] }
    ]
  },
  {
    key: "chemistReleaseLock",
    title: "Chemist - Release/Lock",
    keyFields: ["fieldForceName", "month", "year"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "stockist", label: "Stockist", sourceMaster: "stockistMaster", sourceField: "stockistName" },
      { key: "doctor", label: "Doctor", sourceMaster: "doctorMaster", sourceField: "doctorName" },
      { key: "taggedChemist", label: "Tagged Chemist", sourceMaster: "dealers", sourceField: "dealerName" },
      { key: "month", label: "Month" },
      { key: "year", label: "Year" },
      { key: "status", label: "Status", options: ["Locked", "Released"] }
    ]
  },
  {
    key: "chemistReleaseLockMonthwise",
    title: "Chemist - Release/Lock (Month-wise)",
    keyFields: ["fieldForceName", "month", "year"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "designation", label: "Designation", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "designation" } },
      { key: "empCode", label: "Emp Code", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "employeeCode" } },
      { key: "month", label: "Month" },
      { key: "year", label: "Year" },
      { key: "release", label: "Release", options: ["Yes", "No"] }
    ]
  },
  {
    key: "autoMailSetup",
    title: "Auto Mail Setup",
    keyFields: ["reportName"],
    fields: [
      { key: "reportName", label: "Report Name", options: ["Coverage Analysis", "Missed Call Report", "Visit - Drs", "Daywise DCR - Dump", "Call wise DCR - Dump", "Call Average", "Sample Issued - FieldForce wise", "Input Issued - FieldForce wise", "Visit at a glance", "Campaign Dr Visit Dump", "TP Dump", "DCR_Analysis Dump"] },
      { key: "startingDate", label: "Starting Date", type: "date" },
      { key: "mode", label: "Mode" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "screenAccessSetup",
    title: "Setup For Screen Access",
    keyFields: ["fieldForceName", "entityType"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "designation", label: "Designation", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "designation" } },
      { key: "hq", label: "HQ", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "territory" } },
      { key: "entityType", label: "Entity Type", options: ["Listed Doctor", "Unlisted Doctor", "Chemist", "Territory", "Hospital"] },
      { key: "add", label: "Add", options: ["Yes", "No"] },
      { key: "edit", label: "Edit", options: ["Yes", "No"] },
      { key: "view", label: "View", options: ["Yes", "No"] },
      { key: "delete", label: "Delete", options: ["Yes", "No"] },
      { key: "reactivate", label: "Reactivate", options: ["Yes", "No"] }
    ]
  },
  {
    key: "baseLevelSetup",
    title: "Base Level Setup",
    keyFields: ["settingName"],
    fields: [
      { key: "settingName", label: "Setting Name" },
      { key: "settingValue", label: "Setting Value" },
      { key: "category", label: "Category", options: ["Plan Setup", "DCR Setup", "DCR - Entry Setup", "Doctor Setup", "DCR Approval System", "Doctor Approval", "Chemists Setup", "Stockists Setup", "Tour Plan Setup", "Additional Setup"] }
    ]
  },
  {
    key: "managerSetup",
    title: "Manager Setup",
    keyFields: ["designation", "settingName"],
    fields: [
      { key: "designation", label: "Designation", options: ["BH", "RBM", "ABM", "ZBM", "BRM", "NBM", "Sr ABM", "MH", "SM"] },
      { key: "tpStartDay", label: "TP Start Day", type: "number" },
      { key: "tpEndDay", label: "TP End Day", type: "number" },
      { key: "approvalNeeded", label: "Approval Needed", options: ["Yes", "No"] },
      { key: "settingName", label: "Setting Name" },
      { key: "settingValue", label: "Setting Value" },
      { key: "category", label: "Category", options: ["Plan Setup", "DCR Setup", "DCR - Entry Setup", "Doctor Setup", "DCR Approval System", "Doctor Approval", "Chemists Setup", "Stockists Setup", "Tour Plan Setup", "Additional Setup"] }
    ]
  },
  {
    key: "approvalMandatorySetup",
    title: "Approval Mandatory Setup",
    keyFields: ["transactionType"],
    fields: [
      { key: "transactionType", label: "Transaction Type", options: ["DCR", "TP", "Leave", "Expense", "Listed dr Addition", "Listed dr Deactivation", "Listed dr Addition against Deactivation", "SS Entry", "Doctor Service Form"] },
      { key: "mandatory", label: "Mandatory", options: ["Yes", "No"] }
    ]
  },
  {
    key: "managerwiseCoreDoctorMap",
    title: "Managerwise - Core Doctor Map",
    keyFields: ["managerName", "doctorCode"],
    fields: [
      { key: "managerName", label: "Manager Name", sourceMaster: "employees", sourceField: "name" },
      { key: "hq", label: "HQ", computed: { fromField: "managerName", sourceMaster: "employees", lookupField: "name", displayField: "territory" } },
      { key: "doctorCode", label: "Doctor Code", sourceMaster: "doctorMaster", sourceField: "doctorCode" },
      { key: "doctorName", label: "Doctor Name", computed: { fromField: "doctorCode", sourceMaster: "doctorMaster", lookupField: "doctorCode", displayField: "doctorName" } },
      { key: "speciality", label: "Speciality", computed: { fromField: "doctorCode", sourceMaster: "doctorMaster", lookupField: "doctorCode", displayField: "specialty" } },
      { key: "category", label: "Category", computed: { fromField: "doctorCode", sourceMaster: "doctorClassification", lookupField: "doctorCode", displayField: "doctorCategory" } },
      { key: "territory", label: "Territory" },
      { key: "isCore", label: "Is Core", options: ["Yes", "No"] }
    ]
  },
  {
    key: "screenwiseLock",
    title: "Screenwise Lock",
    keyFields: ["fieldForceName"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "designation", label: "Designation", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "designation" } },
      { key: "hq", label: "HQ", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "territory" } },
      { key: "dcrLock", label: "DCR Lock", options: ["Yes", "No"] },
      { key: "tpLock", label: "TP Lock", options: ["Yes", "No"] },
      { key: "iupLock", label: "IUP Lock", options: ["Yes", "No"] },
      { key: "campaignLock", label: "Campaign Lock", options: ["Yes", "No"] },
      { key: "doctorMapLock", label: "Doctor Map Lock", options: ["Yes", "No"] },
      { key: "logLock", label: "Log Lock", options: ["Yes", "No"] },
      { key: "remarks", label: "Remarks" }
    ]
  },
  {
    key: "mailFolderCreation",
    title: "Mail Folder Creation",
    keyFields: ["mailFolderName"],
    fields: [
      { key: "mailFolderName", label: "Mail Folder Name" },
      { key: "mailCount", label: "Mail Count", type: "number" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "otherSetup",
    title: "Other Setup",
    keyFields: ["settingName"],
    fields: [
      { key: "settingName", label: "Setting Name" },
      { key: "settingValue", label: "Setting Value" },
      { key: "category", label: "Category", options: ["Target Fixation", "SS Entry Setup", "Hospital Business Entry", "Doctor Business Entry", "CRM", "Leave Setup", "Chemist Business Entry", "Additional Setup"] }
    ]
  },
  {
    key: "homepageDashboardDisplay",
    title: "Homepage Dashboard Display",
    keyFields: ["widgetName"],
    fields: [
      { key: "widgetName", label: "Widget Name" },
      { key: "enabled", label: "Enabled", options: ["Yes", "No"] }
    ]
  },
  {
    key: "leaveTypeSetup",
    title: "Leave Setup",
    keyFields: ["employmentType"],
    fields: [
      { key: "employmentType", label: "Employment Type", options: ["Trainee", "Probation", "Confirmed"] },
      { key: "cl", label: "CL", options: ["Yes", "No"] },
      { key: "pl", label: "PL", options: ["Yes", "No"] },
      { key: "sl", label: "SL", options: ["Yes", "No"] },
      { key: "lop", label: "LOP", options: ["Yes", "No"] },
      { key: "isDefault", label: "Is Default", options: ["Yes", "No"] }
    ]
  },
  {
    key: "leavePolicySetup",
    title: "Leave Policy Setup",
    keyFields: ["leaveType"],
    fields: [
      { key: "leaveType", label: "Leave Type", options: ["Common", "CL", "PL", "SL", "LOP"] },
      { key: "calendarYearMode", label: "Calendar Year Mode", options: ["Full Year", "Half Year"] },
      { key: "maxContinuousDays", label: "Max Continuous Days", type: "number" },
      { key: "maxDaysPerMonth", label: "Max Days Per Month", type: "number" },
      { key: "minDays", label: "Min Days", type: "number" },
      { key: "holidaySundayCountsAsLeave", label: "Holiday/Sunday Counts As Leave", options: ["Yes", "No"] },
      { key: "combinationRestriction", label: "Combination Restriction" },
      { key: "leaveTakenBeforeDays", label: "Leave Taken Before Days", type: "number" },
      { key: "maxContinuousDaysForAttachment", label: "Max Continuous Days For Attachment", type: "number" }
    ]
  },
  {
    key: "deviceLock",
    title: "Device Lock",
    keyFields: ["fieldForceName"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "designation", label: "Designation", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "designation" } },
      { key: "empCode", label: "Emp Code", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "employeeCode" } },
      { key: "androidApp", label: "Android App", options: ["Yes", "No"] },
      { key: "geofencingDoctor", label: "Geofencing Doctor", options: ["Yes", "No"] },
      { key: "geofencingChemist", label: "Geofencing Chemist", options: ["Yes", "No"] }
    ]
  },
  {
    key: "orderBookingSetup",
    title: "Order Booking Setup",
    keyFields: ["mode", "fieldForceName"],
    fields: [
      { key: "mode", label: "Mode", options: ["Order Booking", "Order Booking Days", "Order Booking Diary"] },
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "needed", label: "Needed", options: ["Needed", "Not Needed"] },
      { key: "noPerImageUpload", label: "No Per Image Upload", type: "number" },
      { key: "setDaysPerOrder", label: "Set Days Per Order", type: "number" },
      { key: "primary", label: "Primary" },
      { key: "saveDay", label: "Save Day", type: "number" }
    ]
  },
  {
    key: "callFeedbackCreation",
    title: "Call Feedback Creation",
    keyFields: ["feedbackText"],
    fields: [
      { key: "feedbackText", label: "Feedback Text" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "callRemarksTemplates",
    title: "Call Remarks Templates",
    keyFields: ["remarksText"],
    fields: [
      { key: "remarksText", label: "Remarks Text" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "menuCreation",
    title: "Menu Creation",
    keyFields: ["menuType", "menuName"],
    fields: [
      { key: "menuType", label: "Menu Type", options: ["Report", "Menu"] },
      { key: "menuName", label: "Menu Name" },
      { key: "path", label: "Path" },
      { key: "orderBy", label: "Order By", type: "number" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  },
  {
    key: "notificationMessage",
    title: "Notification Message",
    uiKind: "notificationSend",
    keyFields: ["filterBy", "effectiveFrom"],
    fields: [
      { key: "filterBy", label: "Filter By", options: ["FieldForce Base wise", "HQ wise", "Zone wise", "State wise", "Designation wise"] },
      { key: "filterValue", label: "Filter Value" },
      { key: "message", label: "Message" },
      { key: "effectiveFrom", label: "Effective From", type: "date" },
      { key: "effectiveTo", label: "Effective To", type: "date" },
      { key: "status", label: "Status", options: ["Draft", "Sent"] }
    ]
  },
  {
    key: "gpsGeoFenceAllocation",
    title: "Gps/Geo Fence User Allocation",
    keyFields: ["fieldForceName"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "hq", label: "HQ", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "territory" } },
      { key: "designation", label: "Designation", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "designation" } },
      { key: "gps", label: "GPS", options: ["Yes", "No"] },
      { key: "geoFencingDoctor", label: "Geo Fencing Doctor", options: ["Yes", "No"] },
      { key: "geoFencingChemist", label: "Geo Fencing Chemist", options: ["Yes", "No"] },
      { key: "geoFencingStockist", label: "Geo Fencing Stockist", options: ["Yes", "No"] }
    ]
  },
  {
    key: "geoTagDeletion",
    title: "Geo Tag Deletion",
    keyFields: ["entityType", "fieldForceName"],
    fields: [
      { key: "entityType", label: "Entity Type", options: ["Doctor", "Chemist", "Stockist"] },
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "deletedOn", label: "Deleted On", type: "date" },
      { key: "status", label: "Status", options: ["Pending", "Deleted"] }
    ]
  },
  {
    key: "appSetupDynamicAppLink",
    title: "Dynamic App Link",
    keyFields: ["name"],
    fields: [
      { key: "name", label: "Name" },
      { key: "value", label: "Value" },
      { key: "description", label: "Description" },
      { key: "status", label: "Status", options: ["Active", "Inactive"] }
    ]
  },
  {
    key: "mailBoxLog",
    title: "Mail Box",
    keyFields: ["folder", "subject"],
    fields: [
      { key: "folder", label: "Folder", options: ["Inbox", "Sent Mails", "Viewed Mails", "Admin", "Others", "Campaign", "PMT", "Managers"] },
      { key: "subject", label: "Subject" },
      { key: "fromFieldForce", label: "From Field Force", sourceMaster: "employees", sourceField: "name" },
      { key: "sentOn", label: "Sent On", type: "date" },
      { key: "status", label: "Status", options: ["Unread", "Read"] }
    ]
  },
  {
    key: "listedDoctorUploadLog",
    title: "Listed Doctor Upload Tool",
    uiKind: "upload",
    keyFields: ["fileName", "uploadedOn"],
    fields: [
      { key: "fileName", label: "File Name" },
      { key: "uploadedOn", label: "Uploaded On", type: "date" },
      { key: "recordsProcessed", label: "Records Processed", type: "number" },
      { key: "status", label: "Status", options: ["Success", "Failed", "Processing"] }
    ]
  },
  {
    key: "chemistUploadLog",
    title: "Chemists Upload Tool",
    uiKind: "upload",
    keyFields: ["fileName", "uploadedOn"],
    fields: [
      { key: "fileName", label: "File Name" },
      { key: "uploadedOn", label: "Uploaded On", type: "date" },
      { key: "recordsProcessed", label: "Records Processed", type: "number" },
      { key: "status", label: "Status", options: ["Success", "Failed", "Processing"] }
    ]
  },
  {
    key: "sampleDespatchUploadLog",
    title: "Sample Despatch Upload",
    uiKind: "upload",
    keyFields: ["month", "year", "fileName"],
    fields: [
      { key: "month", label: "Month" },
      { key: "year", label: "Year" },
      { key: "fileName", label: "File Name" },
      { key: "overwriteMode", label: "Overwrite Mode", options: ["OverWrite with Existing Records", "Only Insert"] },
      { key: "status", label: "Status", options: ["Success", "Failed"] }
    ]
  },
  {
    key: "inputDespatchUploadLog",
    title: "Input Despatch Upload",
    uiKind: "upload",
    keyFields: ["month", "year", "fileName"],
    fields: [
      { key: "month", label: "Month" },
      { key: "year", label: "Year" },
      { key: "fileName", label: "File Name" },
      { key: "overwriteMode", label: "Overwrite Mode", options: ["OverWrite with Existing Records", "Only Insert"] },
      { key: "status", label: "Status", options: ["Success", "Failed"] }
    ]
  },
  {
    key: "targetUploadLog",
    title: "Target Upload",
    uiKind: "upload",
    keyFields: ["financialYear", "fileName"],
    fields: [
      { key: "financialYear", label: "Financial Year" },
      { key: "fileName", label: "File Name" },
      { key: "status", label: "Status", options: ["Success", "Failed"] }
    ]
  },
  {
    key: "flashNewsSetup",
    title: "Flash News",
    keyFields: ["postedOn"],
    fields: [
      { key: "content", label: "Content" },
      { key: "setAsHomePage", label: "Set As Home Page", options: ["Yes", "No"] },
      { key: "postedOn", label: "Posted On", type: "date" }
    ]
  },
  {
    key: "noticeBoardSetup",
    title: "Notice Board",
    keyFields: ["startDate", "endDate"],
    fields: [
      { key: "content1", label: "Content 1" },
      { key: "content2", label: "Content 2" },
      { key: "content3", label: "Content 3" },
      { key: "startDate", label: "Start Date", type: "date" },
      { key: "endDate", label: "End Date", type: "date" },
      { key: "setAsHomePage", label: "Set As Home Page", options: ["Yes", "No"] }
    ]
  },
  {
    key: "quoteOfTheWeek",
    title: "Quote For The Week",
    keyFields: ["quote"],
    fields: [
      { key: "quote", label: "Quote" },
      { key: "setAsHomePage", label: "Set As Home Page", options: ["Yes", "No"] }
    ]
  },
  {
    key: "talkToUsSetup",
    title: "Talk To Us",
    keyFields: ["content"],
    fields: [
      { key: "content", label: "Content" }
    ]
  },
  {
    key: "fileUploadDesignationwise",
    title: "File Upload (Designation-wise)",
    uiKind: "upload",
    keyFields: ["subject", "designation"],
    fields: [
      { key: "subject", label: "Subject" },
      { key: "fileName", label: "File Name" },
      { key: "designation", label: "Designation", options: ["All", "BH", "Sr RBM", "RBM", "BE", "ABM", "HH", "BDE", "RBE", "ZBM", "Sr ABM", "NBM", "Sr AM", "HM"] },
      { key: "uploadedOn", label: "Uploaded On", type: "date" }
    ]
  },
  {
    key: "userManualUpload",
    title: "User Manual Upload",
    uiKind: "upload",
    keyFields: ["subject", "fileName"],
    fields: [
      { key: "subject", label: "Subject" },
      { key: "fileName", label: "File Name" },
      { key: "uploadedOn", label: "Uploaded On", type: "date" }
    ]
  },
  {
    key: "salesforceUploadLog",
    title: "Salesforce Upload",
    uiKind: "upload",
    keyFields: ["fileName", "uploadedOn"],
    fields: [
      { key: "fileName", label: "File Name" },
      { key: "uploadedOn", label: "Uploaded On", type: "date" },
      { key: "recordsProcessed", label: "Records Processed", type: "number" },
      { key: "status", label: "Status", options: ["Success", "Failed"] }
    ]
  },
  {
    key: "stockistUploadLog",
    title: "Stockist Upload",
    uiKind: "upload",
    keyFields: ["fileName", "uploadedOn"],
    fields: [
      { key: "fileName", label: "File Name" },
      { key: "uploadedOn", label: "Uploaded On", type: "date" },
      { key: "recordsProcessed", label: "Records Processed", type: "number" },
      { key: "status", label: "Status", options: ["Success", "Failed"] }
    ]
  },
  {
    key: "productUploadLog",
    title: "Product Upload",
    uiKind: "upload",
    keyFields: ["fileName", "uploadedOn"],
    fields: [
      { key: "fileName", label: "File Name" },
      { key: "uploadedOn", label: "Uploaded On", type: "date" },
      { key: "recordsProcessed", label: "Records Processed", type: "number" },
      { key: "status", label: "Status", options: ["Success", "Failed"] }
    ]
  },
  {
    key: "productRateUploadLog",
    title: "Product Rate",
    uiKind: "upload",
    keyFields: ["stateName", "fileName"],
    fields: [
      { key: "stateName", label: "State Name", options: ["ALL", ...INDIAN_STATES] },
      { key: "fileName", label: "File Name" },
      { key: "uploadedOn", label: "Uploaded On", type: "date" }
    ]
  },
  {
    key: "slideUploadEDetailing",
    title: "Slide Upload - E-Detailing",
    uiKind: "upload",
    keyFields: ["division", "subDivision", "fileName"],
    fields: [
      { key: "division", label: "Division" },
      { key: "subDivision", label: "Sub Division" },
      { key: "brand", label: "Brand", sourceMaster: "productMaster", sourceField: "productName" },
      { key: "fileName", label: "File Name" },
      { key: "uploadedOn", label: "Uploaded On", type: "date" }
    ]
  },
  {
    key: "holidayFixationUploadLog",
    title: "Holiday Fixation Bulk Upload",
    uiKind: "upload",
    keyFields: ["fileName", "uploadedOn"],
    fields: [
      { key: "fileName", label: "File Name" },
      { key: "uploadedOn", label: "Uploaded On", type: "date" },
      { key: "recordsProcessed", label: "Records Processed", type: "number" }
    ]
  },
  {
    key: "leaveBulkUploadLog",
    title: "Leave Upload",
    uiKind: "upload",
    keyFields: ["financialYear", "fileName"],
    fields: [
      { key: "financialYear", label: "Financial Year" },
      { key: "fileName", label: "File Name" },
      { key: "uploadedOn", label: "Uploaded On", type: "date" }
    ]
  },
  {
    key: "transactionUpload",
    title: "Transaction Upload",
    uiKind: "upload",
    keyFields: ["fileName", "uploadDate"],
    fields: [
      { key: "fileName", label: "File Name" },
      { key: "uploadedBy", label: "Uploaded By", sourceMaster: "employees", sourceField: "name" },
      { key: "uploadDate", label: "Upload Date", type: "date" },
      { key: "recordCount", label: "Record Count", type: "number" },
      { key: "status", label: "Status", options: ["Success", "Failed", "Processing"] }
    ]
  },
  {
    key: "homepageImageUpload",
    title: "Home Page Image Upload (Common)",
    uiKind: "upload",
    keyFields: ["subject", "fileName"],
    fields: [
      { key: "subject", label: "Subject" },
      { key: "fileName", label: "File Name" },
      { key: "uploadedOn", label: "Uploaded On", type: "date" }
    ]
  },
  {
    key: "homepageImageFieldForcewise",
    title: "Home Page - FieldForcewise",
    uiKind: "upload",
    keyFields: ["fieldForceName"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "hq", label: "HQ", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "territory" } },
      { key: "filePath", label: "File Path" },
      { key: "uploadedOn", label: "Uploaded On", type: "date" }
    ]
  },
  {
    key: "leaveStatusReport",
    title: "Leave Status",
    uiKind: "reportFilter",
    keyFields: ["fieldForceName", "fromMonth", "toMonth"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "designation", label: "Designation", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "designation" } },
      { key: "hq", label: "HQ", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "territory" } },
      { key: "empCode", label: "Emp Code", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "employeeCode" } },
      { key: "appliedDate", label: "Applied Date", type: "date" },
      { key: "fromDate", label: "From Date", type: "date" },
      { key: "toDate", label: "To Date", type: "date" },
      { key: "leaveType", label: "Leave Type", options: ["CL", "SL", "PL", "LOP"] },
      { key: "status", label: "Status", options: ["Approved", "Reject", "Pending"] },
      { key: "approvedBy", label: "Approved By" },
      { key: "reason", label: "Reason" },
      { key: "fromMonth", label: "From Month" },
      { key: "fromYear", label: "From Year" },
      { key: "toMonth", label: "To Month" },
      { key: "toYear", label: "To Year" }
    ]
  },
  {
    key: "transferMasterDetails",
    title: "Transfer Master Details",
    keyFields: ["entityType", "transferredOn"],
    fields: [
      { key: "entityType", label: "Entity Type", options: ["Listed Doctor", "Chemist"] },
      { key: "transferFromFieldForce", label: "Transfer From Field Force", sourceMaster: "employees", sourceField: "name" },
      { key: "transferFromTerritory", label: "Transfer From Territory" },
      { key: "transferToFieldForce", label: "Transfer To Field Force", sourceMaster: "employees", sourceField: "name" },
      { key: "transferToTerritory", label: "Transfer To Territory" },
      { key: "transferredOn", label: "Transferred On", type: "date" }
    ]
  },
  {
    key: "unlistedToListedDrConversion",
    title: "Unlisted Drs Convert To Listed Drs",
    keyFields: ["fieldForceName", "unlistedDoctorName"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "unlistedDoctorName", label: "Unlisted Doctor Name" },
      { key: "qualification", label: "Qualification" },
      { key: "specialty", label: "Specialty" },
      { key: "category", label: "Category" },
      { key: "classField", label: "Class" },
      { key: "territory", label: "Territory" },
      { key: "status", label: "Status", options: ["Pending", "Converted"] }
    ]
  },
  {
    key: "delayedRelease",
    title: "Delayed Release",
    keyFields: ["fieldForceName"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "hq", label: "HQ", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "territory" } },
      { key: "designation", label: "Designation", computed: { fromField: "fieldForceName", sourceMaster: "employees", lookupField: "name", displayField: "designation" } },
      { key: "state", label: "State" },
      { key: "lastDcrDate", label: "Last DCR Date", type: "date" },
      { key: "delayedMissingDates", label: "Delayed/Missing Dates" },
      { key: "released", label: "Released", options: ["Yes", "No"] }
    ]
  },
  {
    key: "quizList",
    title: "Quiz List",
    keyFields: ["quizTitle"],
    fields: [
      { key: "quizTitle", label: "Quiz Title" },
      { key: "createdOn", label: "Created On", type: "date" },
      { key: "processFromDate", label: "Process From Date", type: "date" },
      { key: "processToDate", label: "Process To Date", type: "date" },
      { key: "noOfQuestions", label: "No of Questions", type: "number" },
      { key: "uploadedFile", label: "Uploaded File" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE },
      { key: "processed", label: "Processed", options: ["Yes", "No"] }
    ]
  },
  {
    key: "quizCategoryList",
    title: "Quiz Category",
    keyFields: ["shortName"],
    fields: [
      { key: "shortName", label: "Short Name" },
      { key: "categoryName", label: "Category Name" },
      { key: "status", label: "Status", options: ACTIVE_INACTIVE }
    ]
  }
];

export const MASTERS_BY_KEY: Record<string, MasterConfig> = Object.fromEntries(
  MASTERS.map((m) => [m.key, m])
);

export function getMasterConfig(key: string): MasterConfig | undefined {
  return MASTERS_BY_KEY[key];
}
