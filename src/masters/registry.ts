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
};

export type MasterConfig = {
  key: string; // collection name
  title: string; // human title shown in the admin UI
  fields: MasterField[];
  keyFields: string[]; // natural unique key (besides tenantSlug) — used for upsert/update matching
  // Additional fields (besides keyFields) that must also be unique per tenant,
  // e.g. Doctor Name — two doctors can't share a name even though their
  // Doctor Codes differ.
  uniqueFields?: string[];
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
    key: "approvalListedDrAddition",
    title: "Listed Dr Addition",
    keyFields: ["fieldForceName", "requestDate"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "requestDate", label: "Request Date", type: "date" },
      { key: "details", label: "Details" },
      { key: "approvalStatus", label: "Approval Status", options: ["Pending", "Approved", "Rejected"] },
      { key: "remarks", label: "Remarks" }
    ]
  },
  {
    key: "approvalListedDrDeactivation",
    title: "Listed Dr Deactivation",
    keyFields: ["fieldForceName", "requestDate"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "requestDate", label: "Request Date", type: "date" },
      { key: "details", label: "Details" },
      { key: "approvalStatus", label: "Approval Status", options: ["Pending", "Approved", "Rejected"] },
      { key: "remarks", label: "Remarks" }
    ]
  },
  {
    key: "approvalTp",
    title: "TP Approval",
    keyFields: ["fieldForceName", "requestDate"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "requestDate", label: "Request Date", type: "date" },
      { key: "details", label: "Details" },
      { key: "approvalStatus", label: "Approval Status", options: ["Pending", "Approved", "Rejected"] },
      { key: "remarks", label: "Remarks" }
    ]
  },
  {
    key: "approvalDcr",
    title: "DCR Approval",
    keyFields: ["fieldForceName", "requestDate"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "requestDate", label: "Request Date", type: "date" },
      { key: "details", label: "Details" },
      { key: "approvalStatus", label: "Approval Status", options: ["Pending", "Approved", "Rejected"] },
      { key: "remarks", label: "Remarks" }
    ]
  },
  {
    key: "approvalLeave",
    title: "Leave Approval",
    keyFields: ["fieldForceName", "requestDate"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "requestDate", label: "Request Date", type: "date" },
      { key: "details", label: "Details" },
      { key: "approvalStatus", label: "Approval Status", options: ["Pending", "Approved", "Rejected"] },
      { key: "remarks", label: "Remarks" }
    ]
  },
  {
    key: "expenseApprovalActive",
    title: "Expense Approval (Active)",
    keyFields: ["fieldForceName", "requestDate"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "requestDate", label: "Request Date", type: "date" },
      { key: "details", label: "Details" },
      { key: "approvalStatus", label: "Approval Status", options: ["Pending", "Approved", "Rejected"] },
      { key: "remarks", label: "Remarks" }
    ]
  },
  {
    key: "expenseApprovalVacantResigned",
    title: "Expense Approval (Vacant/Resigned)",
    keyFields: ["fieldForceName", "requestDate"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "requestDate", label: "Request Date", type: "date" },
      { key: "details", label: "Details" },
      { key: "approvalStatus", label: "Approval Status", options: ["Pending", "Approved", "Rejected"] },
      { key: "remarks", label: "Remarks" }
    ]
  },
  {
    key: "activitiesExpenseAnalysis",
    title: "Expense Analysis",
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
    key: "sampleDispatchView",
    title: "Sample Dispatch - View",
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
    key: "sampleDispatchStatus",
    title: "Sample Dispatch - Status",
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
    key: "inputDispatchView",
    title: "Input Dispatch - View",
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
    key: "inputDispatchStatus",
    title: "Input Dispatch - Status",
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
    key: "msisView",
    title: "MSIS - View",
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
    key: "loginDetailsManager",
    title: "Login Details - Manager",
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
    key: "loginDetailsFieldrepo",
    title: "Login Details - Fieldrepo",
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
    key: "activityStatus",
    title: "Activity - Status",
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
    key: "managerMissedCallSetup",
    title: "Manager Missed Call - Setup",
    keyFields: ["managerName"],
    fields: [
      { key: "managerName", label: "Manager Name", sourceMaster: "employees", sourceField: "name" },
      { key: "baseLevelTagging", label: "Base Level Tagging" },
      { key: "status", label: "Status", options: ["Active", "Inactive"] }
    ]
  },
  {
    key: "managerMissedCallView",
    title: "Manager Missed Call - View",
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
    key: "passwordChangeLog",
    title: "Change Password",
    keyFields: ["performedBy", "performedDate"],
    fields: [
      { key: "performedBy", label: "Changed By", sourceMaster: "employees", sourceField: "name" },
      { key: "performedDate", label: "Changed On", type: "date" },
      { key: "remarks", label: "Remarks" },
      { key: "status", label: "Status", options: ["Completed"] }
    ]
  },
  {
    key: "vacantMrLoginAccess",
    title: "Vacant MR Login - Access",
    keyFields: ["managerName"],
    fields: [
      { key: "managerName", label: "Manager Name", sourceMaster: "employees", sourceField: "name" },
      { key: "accessLevel", label: "Access Level", options: ["Full", "View Only", "Restricted"] },
      { key: "status", label: "Status", options: ["Active", "Inactive"] }
    ]
  },
  {
    key: "vacantMrLoginPermission",
    title: "Vacant MR Login - Permission for Managers",
    keyFields: ["managerName"],
    fields: [
      { key: "managerName", label: "Manager Name", sourceMaster: "employees", sourceField: "name" },
      { key: "permission", label: "Permission", options: ["Grant", "Revoke"] },
      { key: "status", label: "Status", options: ["Active", "Inactive"] }
    ]
  },
  {
    key: "doctorCampaignMap",
    title: "Doctor - Campaign Map",
    keyFields: ["name"],
    fields: [
      { key: "name", label: "Name" },
      { key: "value", label: "Value" },
      { key: "description", label: "Description" },
      { key: "status", label: "Status", options: ["Active", "Inactive"] }
    ]
  },
  {
    key: "updateDeleteTpDelete",
    title: "TP Delete",
    keyFields: ["referenceId", "performedDate"],
    fields: [
      { key: "referenceId", label: "Reference / Record" },
      { key: "performedBy", label: "Performed By", sourceMaster: "employees", sourceField: "name" },
      { key: "performedDate", label: "Performed Date", type: "date" },
      { key: "remarks", label: "Remarks" },
      { key: "status", label: "Status", options: ["Pending", "Completed"] }
    ]
  },
  {
    key: "updateDeleteDcrEdit",
    title: "DCR Edit",
    keyFields: ["referenceId", "performedDate"],
    fields: [
      { key: "referenceId", label: "Reference / Record" },
      { key: "performedBy", label: "Performed By", sourceMaster: "employees", sourceField: "name" },
      { key: "performedDate", label: "Performed Date", type: "date" },
      { key: "remarks", label: "Remarks" },
      { key: "status", label: "Status", options: ["Pending", "Completed"] }
    ]
  },
  {
    key: "updateDeleteMsisEdit",
    title: "MSIS Edit",
    keyFields: ["referenceId", "performedDate"],
    fields: [
      { key: "referenceId", label: "Reference / Record" },
      { key: "performedBy", label: "Performed By", sourceMaster: "employees", sourceField: "name" },
      { key: "performedDate", label: "Performed Date", type: "date" },
      { key: "remarks", label: "Remarks" },
      { key: "status", label: "Status", options: ["Pending", "Completed"] }
    ]
  },
  {
    key: "updateDeleteMailDelete",
    title: "Mail Delete",
    keyFields: ["referenceId", "performedDate"],
    fields: [
      { key: "referenceId", label: "Reference / Record" },
      { key: "performedBy", label: "Performed By", sourceMaster: "employees", sourceField: "name" },
      { key: "performedDate", label: "Performed Date", type: "date" },
      { key: "remarks", label: "Remarks" },
      { key: "status", label: "Status", options: ["Pending", "Completed"] }
    ]
  },
  {
    key: "updateDeleteLeaveCancellation",
    title: "Leave Cancellation",
    keyFields: ["referenceId", "performedDate"],
    fields: [
      { key: "referenceId", label: "Reference / Record" },
      { key: "performedBy", label: "Performed By", sourceMaster: "employees", sourceField: "name" },
      { key: "performedDate", label: "Performed Date", type: "date" },
      { key: "remarks", label: "Remarks" },
      { key: "status", label: "Status", options: ["Pending", "Completed"] }
    ]
  },
  {
    key: "updateDeleteMobAppDeviceIdDeletion",
    title: "Mob App - Device Id Deletion",
    keyFields: ["referenceId", "performedDate"],
    fields: [
      { key: "referenceId", label: "Reference / Record" },
      { key: "performedBy", label: "Performed By", sourceMaster: "employees", sourceField: "name" },
      { key: "performedDate", label: "Performed Date", type: "date" },
      { key: "remarks", label: "Remarks" },
      { key: "status", label: "Status", options: ["Pending", "Completed"] }
    ]
  },
  {
    key: "updateDeleteTpDeviationRelease",
    title: "TP Deviation - Release",
    keyFields: ["referenceId", "performedDate"],
    fields: [
      { key: "referenceId", label: "Reference / Record" },
      { key: "performedBy", label: "Performed By", sourceMaster: "employees", sourceField: "name" },
      { key: "performedDate", label: "Performed Date", type: "date" },
      { key: "remarks", label: "Remarks" },
      { key: "status", label: "Status", options: ["Pending", "Completed"] }
    ]
  },
  {
    key: "updateDeleteDrsUniNoGeneration",
    title: "Drs UNI No - Generation",
    keyFields: ["referenceId", "performedDate"],
    fields: [
      { key: "referenceId", label: "Reference / Record" },
      { key: "performedBy", label: "Performed By", sourceMaster: "employees", sourceField: "name" },
      { key: "performedDate", label: "Performed Date", type: "date" },
      { key: "remarks", label: "Remarks" },
      { key: "status", label: "Status", options: ["Pending", "Completed"] }
    ]
  },
  {
    key: "updateDeleteChemistBusinessRelease",
    title: "Chemist Business - Release",
    keyFields: ["referenceId", "performedDate"],
    fields: [
      { key: "referenceId", label: "Reference / Record" },
      { key: "performedBy", label: "Performed By", sourceMaster: "employees", sourceField: "name" },
      { key: "performedDate", label: "Performed Date", type: "date" },
      { key: "remarks", label: "Remarks" },
      { key: "status", label: "Status", options: ["Pending", "Completed"] }
    ]
  },
  {
    key: "updateDeleteChemBusMonthRelease",
    title: "Chem Bus-Month Release",
    keyFields: ["referenceId", "performedDate"],
    fields: [
      { key: "referenceId", label: "Reference / Record" },
      { key: "performedBy", label: "Performed By", sourceMaster: "employees", sourceField: "name" },
      { key: "performedDate", label: "Performed Date", type: "date" },
      { key: "remarks", label: "Remarks" },
      { key: "status", label: "Status", options: ["Pending", "Completed"] }
    ]
  },
  {
    key: "updateDeleteAutoMailReports",
    title: "Auto Mail Reports",
    keyFields: ["referenceId", "performedDate"],
    fields: [
      { key: "referenceId", label: "Reference / Record" },
      { key: "performedBy", label: "Performed By", sourceMaster: "employees", sourceField: "name" },
      { key: "performedDate", label: "Performed Date", type: "date" },
      { key: "remarks", label: "Remarks" },
      { key: "status", label: "Status", options: ["Pending", "Completed"] }
    ]
  },
  {
    key: "basicSetupScreenAccessRights",
    title: "Screen Access Rights",
    keyFields: ["name"],
    fields: [
      { key: "name", label: "Name" },
      { key: "value", label: "Value" },
      { key: "description", label: "Description" },
      { key: "status", label: "Status", options: ["Active", "Inactive"] }
    ]
  },
  {
    key: "basicSetupBaseLevel",
    title: "Base Level",
    keyFields: ["name"],
    fields: [
      { key: "name", label: "Name" },
      { key: "value", label: "Value" },
      { key: "description", label: "Description" },
      { key: "status", label: "Status", options: ["Active", "Inactive"] }
    ]
  },
  {
    key: "basicSetupManagers",
    title: "Managers",
    keyFields: ["name"],
    fields: [
      { key: "name", label: "Name" },
      { key: "value", label: "Value" },
      { key: "description", label: "Description" },
      { key: "status", label: "Status", options: ["Active", "Inactive"] }
    ]
  },
  {
    key: "basicSetupApprovalMandatory",
    title: "Approval Mandatory",
    keyFields: ["name"],
    fields: [
      { key: "name", label: "Name" },
      { key: "value", label: "Value" },
      { key: "description", label: "Description" },
      { key: "status", label: "Status", options: ["Active", "Inactive"] }
    ]
  },
  {
    key: "basicSetupManagerwiseCoreDoctorMap",
    title: "Managerwise Core Doctor Map",
    keyFields: ["name"],
    fields: [
      { key: "name", label: "Name" },
      { key: "value", label: "Value" },
      { key: "description", label: "Description" },
      { key: "status", label: "Status", options: ["Active", "Inactive"] }
    ]
  },
  {
    key: "basicSetupScreenwiseAccess",
    title: "Screenwise Access",
    keyFields: ["name"],
    fields: [
      { key: "name", label: "Name" },
      { key: "value", label: "Value" },
      { key: "description", label: "Description" },
      { key: "status", label: "Status", options: ["Active", "Inactive"] }
    ]
  },
  {
    key: "basicSetupMailFolderCreation",
    title: "Mail Folder Creation",
    keyFields: ["name"],
    fields: [
      { key: "name", label: "Name" },
      { key: "value", label: "Value" },
      { key: "description", label: "Description" },
      { key: "status", label: "Status", options: ["Active", "Inactive"] }
    ]
  },
  {
    key: "basicSetupOtherSetup",
    title: "Other Setup",
    keyFields: ["name"],
    fields: [
      { key: "name", label: "Name" },
      { key: "value", label: "Value" },
      { key: "description", label: "Description" },
      { key: "status", label: "Status", options: ["Active", "Inactive"] }
    ]
  },
  {
    key: "basicSetupHomepageDashboardDisplay",
    title: "Homepage Dashboard Display",
    keyFields: ["name"],
    fields: [
      { key: "name", label: "Name" },
      { key: "value", label: "Value" },
      { key: "description", label: "Description" },
      { key: "status", label: "Status", options: ["Active", "Inactive"] }
    ]
  },
  {
    key: "basicSetupLeaveSetup",
    title: "Leave Setup",
    keyFields: ["name"],
    fields: [
      { key: "name", label: "Name" },
      { key: "value", label: "Value" },
      { key: "description", label: "Description" },
      { key: "status", label: "Status", options: ["Active", "Inactive"] }
    ]
  },
  {
    key: "basicSetupLeavePolicySetup",
    title: "Leave Policy Setup",
    keyFields: ["name"],
    fields: [
      { key: "name", label: "Name" },
      { key: "value", label: "Value" },
      { key: "description", label: "Description" },
      { key: "status", label: "Status", options: ["Active", "Inactive"] }
    ]
  },
  {
    key: "basicSetupDeviceLock",
    title: "Device Lock",
    keyFields: ["name"],
    fields: [
      { key: "name", label: "Name" },
      { key: "value", label: "Value" },
      { key: "description", label: "Description" },
      { key: "status", label: "Status", options: ["Active", "Inactive"] }
    ]
  },
  {
    key: "basicSetupOrderBookingSetup",
    title: "Order Booking Setup",
    keyFields: ["name"],
    fields: [
      { key: "name", label: "Name" },
      { key: "value", label: "Value" },
      { key: "description", label: "Description" },
      { key: "status", label: "Status", options: ["Active", "Inactive"] }
    ]
  },
  {
    key: "appSetupCallFeedback",
    title: "Call Feedback",
    keyFields: ["name"],
    fields: [
      { key: "name", label: "Name" },
      { key: "value", label: "Value" },
      { key: "description", label: "Description" },
      { key: "status", label: "Status", options: ["Active", "Inactive"] }
    ]
  },
  {
    key: "appSetupCallRemarksTemplates",
    title: "Call Remarks Templates",
    keyFields: ["name"],
    fields: [
      { key: "name", label: "Name" },
      { key: "value", label: "Value" },
      { key: "description", label: "Description" },
      { key: "status", label: "Status", options: ["Active", "Inactive"] }
    ]
  },
  {
    key: "appSetupNotificationMessage",
    title: "Notification Message",
    keyFields: ["name"],
    fields: [
      { key: "name", label: "Name" },
      { key: "value", label: "Value" },
      { key: "description", label: "Description" },
      { key: "status", label: "Status", options: ["Active", "Inactive"] }
    ]
  },
  {
    key: "appSetupGpsGeofenceTaggDeletion",
    title: "Gps/Geofence & Tagg Deletion",
    keyFields: ["name"],
    fields: [
      { key: "name", label: "Name" },
      { key: "value", label: "Value" },
      { key: "description", label: "Description" },
      { key: "status", label: "Status", options: ["Active", "Inactive"] }
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
    key: "mailBox",
    title: "Mail Box",
    keyFields: ["subject", "sentDate"],
    fields: [
      { key: "subject", label: "Subject" },
      { key: "sentTo", label: "Sent To", sourceMaster: "employees", sourceField: "name" },
      { key: "sentDate", label: "Sent Date", type: "date" },
      { key: "status", label: "Status", options: ["Sent", "Draft", "Read"] }
    ]
  },
  {
    key: "customerUploadListedDoctor",
    title: "Customer Upload - Listed Doctor",
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
    key: "customerUploadChemist",
    title: "Customer Upload - Chemist",
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
    key: "customerUploadSample",
    title: "Customer Upload - Sample",
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
    key: "customerUploadInput",
    title: "Customer Upload - Input",
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
    key: "customerUploadTarget",
    title: "Customer Upload - Target",
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
    key: "informationUploadFlashNews",
    title: "Information Upload - Flash News",
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
    key: "informationUploadNoticeBoard",
    title: "Information Upload - Notice Board",
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
    key: "informationUploadQuoteForTheWeek",
    title: "Information Upload - Quote for the Week",
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
    key: "informationUploadTalkToUs",
    title: "Information Upload - Talk to Us",
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
    key: "informationUploadFileCircularDesigWise",
    title: "Information Upload - File/Circular (Desig.Wise)",
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
    key: "informationUploadUserManualUpload",
    title: "Information Upload - User Manual Upload",
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
    key: "bulkUploadFieldForce",
    title: "Upload - Field Force",
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
    key: "bulkUploadStockist",
    title: "Upload - Stockist",
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
    key: "bulkUploadProduct",
    title: "Upload - Product",
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
    key: "bulkUploadProductRate",
    title: "Upload - Product Rate",
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
    key: "bulkUploadSlidesUpload",
    title: "Upload - Slides Upload",
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
    key: "bulkUploadHolidayFixation",
    title: "Upload - Holiday Fixation",
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
    key: "bulkUploadLeaveBulkUpload",
    title: "Upload - Leave-Bulk Upload",
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
    key: "transactionUpload",
    title: "Transaction Upload",
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
    key: "imageUploadHomePageCommonForAll",
    title: "Image Upload - Home Page (Common For All)",
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
    key: "imageUploadHomePageFieldforcewise",
    title: "Image Upload - Home Page (FieldForcewise)",
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
    key: "leaveStatusOptions",
    title: "Leave Status",
    keyFields: ["fieldForceName", "month", "year"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "month", label: "Month" },
      { key: "year", label: "Year" },
      { key: "leaveBalance", label: "Leave Balance", type: "number" },
      { key: "leaveTaken", label: "Leave Taken", type: "number" }
    ]
  },
  {
    key: "transferMasterDetails",
    title: "Transfers - Master Details",
    keyFields: ["fieldForceName", "transferDate"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "fromTerritory", label: "From Territory", sourceMaster: "territoryHqMaster", sourceField: "headquartersName" },
      { key: "toTerritory", label: "To Territory", sourceMaster: "territoryHqMaster", sourceField: "headquartersName" },
      { key: "transferDate", label: "Transfer Date", type: "date" },
      { key: "status", label: "Status", options: ["Pending", "Approved", "Completed"] }
    ]
  },
  {
    key: "convertUnlistedDrsListedDrs",
    title: "Convert Unlisted Drs - Listed Drs",
    keyFields: ["referenceId", "performedDate"],
    fields: [
      { key: "referenceId", label: "Reference / Record" },
      { key: "performedBy", label: "Performed By", sourceMaster: "employees", sourceField: "name" },
      { key: "performedDate", label: "Performed Date", type: "date" },
      { key: "remarks", label: "Remarks" },
      { key: "status", label: "Status", options: ["Pending", "Completed"] }
    ]
  },
  {
    key: "releaseMissingDatesDelay",
    title: "Release - Missing Dates / Delay",
    keyFields: ["fieldForceName", "performedDate"],
    fields: [
      { key: "fieldForceName", label: "Field Force Name", sourceMaster: "employees", sourceField: "name" },
      { key: "missingDate", label: "Missing Date", type: "date" },
      { key: "reason", label: "Reason" },
      { key: "status", label: "Status", options: ["Pending", "Released"] }
    ]
  },
  {
    key: "quizMaster",
    title: "Quiz",
    keyFields: ["quizName"],
    fields: [
      { key: "quizName", label: "Quiz Name" },
      { key: "category", label: "Category" },
      { key: "totalQuestions", label: "Total Questions", type: "number" },
      { key: "status", label: "Status", options: ["Active", "Inactive"] }
    ]
  },
  {
    key: "quizCategory",
    title: "Quiz Category",
    keyFields: ["categoryName"],
    fields: [
      { key: "categoryName", label: "Category Name" },
      { key: "description", label: "Description" },
      { key: "status", label: "Status", options: ["Active", "Inactive"] }
    ]
  }
];

export const MASTERS_BY_KEY: Record<string, MasterConfig> = Object.fromEntries(
  MASTERS.map((m) => [m.key, m])
);

export function getMasterConfig(key: string): MasterConfig | undefined {
  return MASTERS_BY_KEY[key];
}
