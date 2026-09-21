"""
Loads Zivira_Demo_Sample_Data.xlsx into MongoDB using the EXACT collection names
and camelCase field keys that the backend's generic masters API (registry.ts +
masters.routes.ts) expects. This is the bridge between the document-derived demo
data you already reviewed and the new /api/company/masters/:key endpoints.

Usage:
    pip install pymongo openpyxl pandas --break-system-packages   (if needed)

    DEMO_MONGODB_URI="mongodb+srv://<user>:<password>@demo-datas.xxxxx.mongodb.net/demo_datas?retryWrites=true&w=majority" \
    TENANT_SLUG="zivira-labs" \
    python3 load_masters_data.py /path/to/Zivira_Demo_Sample_Data.xlsx

Safe to re-run — every record upserts on its natural key(s), same as before.
"""

import os
import sys
import pandas as pd
from pymongo import MongoClient, UpdateOne

EXCEL_PATH = sys.argv[1] if len(sys.argv) > 1 else "Zivira_Demo_Sample_Data.xlsx"
MONGO_URI = os.environ.get("DEMO_MONGODB_URI")
TENANT_SLUG = os.environ.get("TENANT_SLUG", "zivira-labs")

if not MONGO_URI:
    print("Set DEMO_MONGODB_URI to your demo-datas cluster connection string.")
    sys.exit(1)
if not os.path.exists(EXCEL_PATH):
    print(f"Excel file not found: {EXCEL_PATH}")
    sys.exit(1)

# sheet_name -> (collection key, {Excel header -> camelCase field}, [camelCase key fields])
SHEET_CONFIG = {
    "1 Division Master": ("divisionMaster", {
        "Division Code": "divisionCode", "Division Name": "divisionName",
        "Division Short Name": "divisionShortName", "Description": "description", "Status": "status"
    }, ["divisionCode"]),
    "2 Region-Zone Master": ("regionZoneMaster", {
        "Zone Name": "zoneName", "Region Name": "regionName", "Region Code": "regionCode",
        "State": "state", "Manager": "manager"
    }, ["regionCode"]),
    "3 Territory-HQ Master": ("territoryHqMaster", {
        "HQ Code": "hqCode", "Headquarters Name": "headquartersName", "State": "state", "City": "city",
        "Metro / Non-Metro": "metroNonMetro", "Zone": "zone", "Region": "region", "Patch Name": "patchName"
    }, ["hqCode"]),
    "4 Therapy Master": ("therapyMaster", {
        "Therapy Code": "therapyCode", "Therapy Name": "therapyName", "Description": "description", "Status": "status"
    }, ["therapyCode"]),
    "5 Molecule Master": ("moleculeMaster", {
        "Molecule Code": "moleculeCode", "Molecule Name": "moleculeName", "Therapy": "therapy",
        "Description": "description", "Status": "status"
    }, ["moleculeCode"]),
    "6 Brand Master": ("brandMaster", {
        "Brand Code": "brandCode", "Brand Name": "brandName", "Molecule": "molecule",
        "Therapy": "therapy", "Division": "division"
    }, ["brandCode"]),
    "7 Product Master": ("productMaster", {
        "Product Code": "productCode", "Product Name": "productName", "Brand": "brand", "Strength": "strength",
        "Pack": "pack", "SKU": "sku", "Division": "division", "UOM": "uom", "Status": "status"
    }, ["productCode"]),
    "8 Rate Master": ("rateMaster", {
        "Product": "product", "Batch No": "batchNo", "Manufacturing Date": "manufacturingDate",
        "Expiry Date": "expiryDate", "Pack": "pack", "PTR": "ptr", "PTS": "pts", "MRP": "mrp",
        "Effective Date": "effectiveDate"
    }, ["product", "batchNo"]),
    "10 Doctor Master": ("doctorMaster", {
        "Doctor Code": "doctorCode", "Doctor Name": "doctorName", "Qualification": "qualification",
        "Specialty": "specialty", "Registration Number": "registrationNumber"
    }, ["doctorCode"]),
    "11 Doctor Address": ("doctorAddress", {
        "Doctor Code": "doctorCode", "Clinic Name": "clinicName", "Address": "address", "Area": "area",
        "City": "city", "State": "state", "Country": "country", "PIN Code": "pinCode"
    }, ["doctorCode"]),
    "12 Doctor Classification": ("doctorClassification", {
        "Doctor Code": "doctorCode", "Doctor Category (A/B/C)": "doctorCategory", "Potential": "potential",
        "Visit Frequency": "visitFrequency", "Active": "active"
    }, ["doctorCode"]),
    "13 Doctor Mapping": ("doctorMapping", {
        "Doctor Code": "doctorCode", "Division": "division", "HQ": "hq", "Patch": "patch",
        "Medical Representative": "medicalRepresentative", "Area Manager": "areaManager"
    }, ["doctorCode"]),
    "14 Doctor Dealer Mapping": ("doctorDealerMapping", {
        "Doctor Code": "doctorCode", "Stockist": "stockist", "Chemist": "chemist", "Distributor": "distributor"
    }, ["doctorCode"]),
    "15 Doctor Contact Details": ("doctorContactDetails", {
        "Doctor Code": "doctorCode", "Mobile": "mobile", "Phone": "phone", "Email": "email", "WhatsApp": "whatsapp"
    }, ["doctorCode"]),
    "16 Doctor Additional Info": ("doctorAdditionalInfo", {
        "Doctor Code": "doctorCode", "Birth Date": "birthDate", "Anniversary": "anniversary",
        "Remarks": "remarks", "Latitude": "latitude", "Longitude": "longitude"
    }, ["doctorCode"]),
    "17 Input Master": ("inputMaster", {
        "Input Code": "inputCode", "Input Name": "inputName", "Category": "category", "Unit": "unit", "Status": "status"
    }, ["inputCode"]),
    "18 Patch Name Master": ("patchNameMaster", {
        "Patch Code": "patchCode", "Patch Name": "patchName", "HQ": "hq", "Region": "region",
        "Division": "division", "Medical Representative": "medicalRepresentative", "Area Manager": "areaManager",
        "No of Doctors": "noOfDoctors", "Status": "status"
    }, ["patchCode"]),
    "19 Attendance": ("attendance", {
        "Date": "date", "Employee": "employee", "HQ": "hq", "Attendance Type": "attendanceType",
        "Check In": "checkIn", "Check Out": "checkOut", "GPS": "gps", "Remarks": "remarks"
    }, ["date", "employee"]),
    "20 Holiday State Master": ("holidayStateMaster", {
        "State": "state", "Holiday Name": "holidayName", "Date": "date", "Holiday Type": "holidayType", "Status": "status"
    }, ["state", "holidayName"]),
    "21 Holiday Calendar": ("holidayCalendar", {
        "Year": "year", "State": "state", "Holiday": "holiday", "Holiday Date": "holidayDate",
        "Holiday Type": "holidayType", "Status": "status"
    }, ["year", "state", "holiday"]),
    "22 Stockist Master": ("stockistMaster", {
        "Stockist Code": "stockistCode", "Stockist Name": "stockistName", "GST No": "gstNo", "License No": "licenseNo"
    }, ["stockistCode"]),
    "23 Stockist Address": ("stockistAddress", {
        "Stockist Code": "stockistCode", "Address": "address", "City": "city", "State": "state", "PIN": "pin"
    }, ["stockistCode"]),
    "24 Stockist Contact": ("stockistContact", {
        "Stockist Code": "stockistCode", "Contact Person": "contactPerson", "Mobile": "mobile", "Email": "email"
    }, ["stockistCode"]),
    "25 Stockist Headquarters": ("stockistHeadquarters", {
        "Stockist Code": "stockistCode", "HQ": "hq", "Territory": "territory"
    }, ["stockistCode"]),
    "26 Stockist Division Mapping": ("stockistDivisionMapping", {
        "Stockist Code": "stockistCode", "Division": "division", "Products": "products"
    }, ["stockistCode"]),
    "27 Stockist Bank Details": ("stockistBankDetails", {
        "Stockist Code": "stockistCode", "Bank": "bank", "Account No": "accountNo", "IFSC": "ifsc"
    }, ["stockistCode"]),
    "28 Stockist License Details": ("stockistLicenseDetails", {
        "Stockist Code": "stockistCode", "Drug License": "drugLicense", "Expiry Date": "expiryDate"
    }, ["stockistCode"]),
    "29 Stockist Status": ("stockistStatus", {"Stockist": "stockist", "Status": "status"}, ["stockist"]),
    "30 Expense Types": ("expenseTypes", {
        "Expense Type": "expenseType", "Description": "description", "Status": "status"
    }, ["expenseType"]),
    "35 Expense Category": ("expenseCategory", {"Category": "category", "Maximum Limit": "maximumLimit"}, ["category"]),
    "36 Manager Travel Approval": ("managerTravelApproval", {
        "Employee": "employee", "Claim ID": "claimId", "Amount": "amount", "Status": "status"
    }, ["claimId"]),
    "38 Employee Personal Info": ("employeePersonalInfo", {
        "Employee Code": "employeeCode", "Father's Name": "fathersName", "Mother's Name": "mothersName",
        "Blood Group": "bloodGroup", "Aadhaar": "aadhaar", "PAN": "pan", "Passport": "passport",
        "Emergency Contact": "emergencyContact", "Bank Details": "bankDetails"
    }, ["employeeCode"]),
}


def main():
    client = MongoClient(MONGO_URI)
    db = client.get_default_database()
    print(f"Connected to database: {db.name}  (tenantSlug={TENANT_SLUG})")

    xl = pd.ExcelFile(EXCEL_PATH)
    available = set(xl.sheet_names)

    summary = []
    for sheet_name, (collection_key, header_map, key_fields) in SHEET_CONFIG.items():
        if sheet_name not in available:
            print(f"⚠️  Sheet not found, skipping: {sheet_name}")
            continue

        df = xl.parse(sheet_name)
        df = df.where(pd.notnull(df), None)
        records = df.to_dict(orient="records")

        ops = []
        for rec in records:
            doc = {"tenantSlug": TENANT_SLUG}
            for excel_header, camel_key in header_map.items():
                if excel_header in rec:
                    doc[camel_key] = rec[excel_header]
            if "status" not in doc:
                doc["status"] = "Active"

            filt = {"tenantSlug": TENANT_SLUG}
            for k in key_fields:
                filt[k] = doc.get(k)

            ops.append(UpdateOne(filt, {"$set": doc}, upsert=True))

        if not ops:
            continue

        result = db[collection_key].bulk_write(ops, ordered=False)
        summary.append((collection_key, len(ops), result.upserted_count, result.modified_count))

    print("\n── Masters data load summary ─────────────────────────────────")
    for collection_key, total, upserted, modified in summary:
        print(f"{collection_key:28s} rows: {total:2d}  inserted: {upserted:2d}  updated: {modified:2d}")
    print("─────────────────────────────────────────────────────────────")
    print("Done.")


if __name__ == "__main__":
    main()
