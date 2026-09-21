"""
Loads sample data for the 16 new generic masters covering "Daily MR Work"
(6 entry screens) and "Manager Activity Report" (10 report screens).

All rows cross-reference the same 10 employees, HQs, patches, and doctors
already loaded by load_legacy_collections.py / load_masters_data.py, so
dropdown selections and computed (auto-filled) fields resolve consistently.

Usage:
    DEMO_MONGODB_URI="mongodb+srv://.../demo_datas?..." \
    TENANT_SLUG="zivira-labs" \
    python3 load_activity_reports.py

Safe to re-run — every record upserts on its natural key.
"""

import os
import sys
from pymongo import MongoClient, UpdateOne

MONGO_URI = os.environ.get("DEMO_MONGODB_URI")
TENANT_SLUG = os.environ.get("TENANT_SLUG", "zivira-labs")

if not MONGO_URI:
    print("Set DEMO_MONGODB_URI to your demo-datas cluster connection string.")
    sys.exit(1)

EMP = [  # (code, name, hq, patch, division)
    ("EMP-MR-0001", "Rahul Sharma", "Chennai Central HQ", "T. Nagar Patch", "Zivira"),
    ("EMP-MR-0002", "Priya Nair", "Kochi HQ", "Kaloor Patch", "Zivira"),
    ("EMP-MR-0003", "Anil Anjaneya", "Hyderabad HQ", "Kukatpally Patch", "Astra"),
    ("EMP-ASM-0001", "Karthik Raja", "Chennai Central HQ", "Anna Nagar Patch", "Zivira"),
    ("EMP-MR-0004", "Divya Menon", "Coimbatore HQ", "RS Puram Patch", "Aura"),
    ("EMP-MR-0005", "Suresh Kumar", "Bengaluru HQ", "Koramangala Patch", "Astra"),
    ("EMP-RSM-0001", "Meera Iyer", "Chennai Central HQ", "T. Nagar Patch", "Zivira"),
    ("EMP-MR-0006", "Arjun Reddy", "Vijayawada HQ", "Benz Circle Patch", "Aura"),
    ("EMP-MR-0007", "Sneha Patel", "Mumbai HQ", "Andheri Patch", "Zivira"),
    ("EMP-ASM-0002", "Vikram Singh", "Delhi HQ", "Karol Bagh Patch", "Astra"),
]
DOCTORS = ["Dr. Rajesh Kumar", "Dr. Priya Nair", "Dr. Ananya Mehta", "Dr. Vivek Menon", "Dr. Kavitha Rao",
           "Dr. Suresh Babu", "Dr. Lakshmi Narayan", "Dr. Arvind Rao", "Dr. Deepa Krishnan", "Dr. Manoj Tiwari"]
CHEMISTS = ["Apollo Pharmacy - T. Nagar", "Trust Pharmacy - Kaloor", "Care Chemist - Kukatpally",
            "Lifecare Pharmacy - RS Puram", "Wellness Forever - Koramangala", "City Medicals - Benz Circle",
            "Noble Chemist - Andheri", "Global Pharmacy - Karol Bagh"]
PRODUCTS = ["Zivifresh 0.05% Cream", "Zivamox 500mg Capsule", "Astralong 5mg Tablet", "Aramet 500mg Tablet",
            "Zivapan 40mg Capsule", "Astragaba 300mg Capsule"]
DATES = [f"2026-01-{d:02d}" for d in range(5, 15)]

DCR_ENTRY = [
    dict(date=DATES[i], employee=EMP[i][1], hq=EMP[i][2], patch=EMP[i][3], doctor=DOCTORS[i], chemist=CHEMISTS[i % len(CHEMISTS)],
         hospital=f"{['Apollo', 'Government General', 'Yashoda', 'Kovai Medical', 'Manipal'][i % 5]} Hospital",
         productsPromoted=PRODUCTS[i % len(PRODUCTS)], samplesIssued=str(5 + i), callType=["Single", "Joint", "Group"][i % 3],
         visitTime=f"{9 + i % 8}:{'00' if i % 2 == 0 else '30'} AM", remarks="Good response to new formulation",
         nextVisitDate=f"2026-01-{(15 + i):02d}")
    for i in range(10)
]

TOUR_PLAN_ENTRY = [
    dict(tourDate=DATES[i], employee=EMP[i][1], hq=EMP[i][2], patch=EMP[i][3], plannedDoctors=6 + i % 4,
         plannedChemists=3 + i % 3, plannedHospitals=1 + i % 2,
         purpose=["Regular Coverage", "New Launch", "Camp Visit", "Joint Work"][i % 4],
         status=["Approved", "Pending", "Approved", "Approved", "Pending"][i % 5])
    for i in range(10)
]

EXPENSE_ENTRY = [
    dict(expenseDate=DATES[i], employee=EMP[i][1], expenseType=["Local Conveyance", "Daily Allowance", "Hotel Accommodation", "Telephone Allowance"][i % 4],
         amount=300 + i * 45, billNumber=f"BILL-{2026000 + i}", attachment=f"receipt_{i+1}.pdf",
         approvalStatus=["Approved", "Pending", "Approved", "Rejected"][i % 4], remarks="Field visit expenses")
    for i in range(10)
]

LEAVE_ENTRY = [
    dict(employee=EMP[i][1], leaveType=["Casual Leave", "Sick Leave", "Earned Leave", "Comp-Off"][i % 4],
         fromDate=DATES[i], toDate=DATES[min(i + 1, 9)], totalDays=1 + i % 3,
         reason=["Personal work", "Feeling unwell", "Family function", "Rest day"][i % 4],
         approvedBy=EMP[(i + 3) % 10][1], status=["Approved", "Pending", "Approved"][i % 3])
    for i in range(10)
]

CAMP_ENTRY = [
    dict(campCode=f"CAMP{str(i+1).zfill(4)}", campName=f"{['Diabetes', 'Cardiac', 'Skin', 'Ortho', 'Eye'][i % 5]} Awareness Camp",
         campDate=DATES[i], hospital=f"{['Apollo', 'Government General', 'Yashoda', 'Kovai Medical', 'Manipal'][i % 5]} Hospital",
         doctor=DOCTORS[i], organizer=EMP[i][1], noOfPatients=40 + i * 8,
         productsDisplayed=PRODUCTS[i % len(PRODUCTS)], remarks="Well attended", status="Active")
    for i in range(10)
]

MARKET_SURVEY_ENTRY = [
    dict(surveyDate=DATES[i], employee=EMP[i][1], hq=EMP[i][2], patch=EMP[i][3], chemist=CHEMISTS[i % len(CHEMISTS)],
         competitorCompany=["GSK", "Micro Labs", "Alkem", "Glenmark", "Torrent"][i % 5],
         competitorBrand=["Calpol", "Dolo 650", "Pan 40", "Telma", "Shelcal"][i % 5],
         competitorProduct=["Paracetamol Syrup", "Paracetamol Tablet", "Pantoprazole Tablet", "Telmisartan Tablet", "Calcium Tablet"][i % 5],
         competitorMrp=45 + i * 5, availability=["Available", "Short Supply", "Available"][i % 3],
         feedback="Chemist prefers our pricing", remarks="Competitive market")
    for i in range(10)
]

ATTENDANCE_REPORT = [
    dict(date=DATES[i], employeeCode=EMP[i][0], division=EMP[i][4], hq=EMP[i][2], patch=EMP[i][3],
         attendanceType="Field Work", checkIn="09:15 AM", checkOut="06:30 PM", totalWorkingHours="9h 15m",
         gpsCheckIn="13.0827,80.2707", gpsCheckOut="13.0850,80.2101",
         managerApproval=["Approved", "Pending", "Approved"][i % 3], remarks="Full day field coverage")
    for i in range(10)
]

DCR_SUMMARY_REPORT = [
    dict(date=DATES[i], employeeCode=EMP[i][0], division=EMP[i][4], hq=EMP[i][2], patch=EMP[i][3],
         plannedCalls=8, callsCompleted=6 + i % 3, doctorsVisited=4 + i % 2, chemistsVisited=2 + i % 2,
         hospitalsVisited=1, productsPromoted=str(2 + i % 3), samplesDistributed=str(5 + i),
         giftsDistributed=str(i % 3), workingHours="8h 30m")
    for i in range(10)
]

TOUR_PLAN_REPORT = [
    dict(tourDate=DATES[i], employeeCode=EMP[i][0], division=EMP[i][4], hq=EMP[i][2], patch=EMP[i][3],
         plannedDoctorVisits=8, actualDoctorVisits=6 + i % 3, achievementPercentage=round((6 + i % 3) / 8 * 100, 1),
         tourStatus=["Completed", "Pending", "Completed"][i % 3], managerApproval=["Approved", "Pending", "Approved"][i % 3])
    for i in range(10)
]

EXPENSE_REPORT = [
    dict(expenseDate=DATES[i], employeeCode=EMP[i][0], division=EMP[i][4], hq=EMP[i][2],
         expenseType=["Local Conveyance", "Daily Allowance", "Hotel Accommodation"][i % 3],
         description="Field travel and daily expenses", amount=300 + i * 45, receiptAttached="Yes",
         approvalStatus=["Approved", "Pending", "Approved"][i % 3], approvedBy=EMP[(i + 3) % 10][1])
    for i in range(10)
]

LEAVE_REPORT = [
    dict(employee=EMP[i][1], hq=EMP[i][2], leaveType=["Casual Leave", "Sick Leave", "Earned Leave"][i % 3],
         fromDate=DATES[i], toDate=DATES[min(i + 1, 9)], totalDays=1 + i % 3,
         reason="Personal", status=["Approved", "Pending", "Approved"][i % 3], approvedBy=EMP[(i + 3) % 10][1])
    for i in range(10)
]

CAMP_REPORT = [
    dict(campDate=DATES[i], campName=f"{['Diabetes', 'Cardiac', 'Skin', 'Ortho', 'Eye'][i % 5]} Awareness Camp",
         hospital=f"{['Apollo', 'Government General', 'Yashoda', 'Kovai Medical', 'Manipal'][i % 5]} Hospital",
         doctor=DOCTORS[i], mr=EMP[i][1], patients=40 + i * 8, productsPromoted=PRODUCTS[i % len(PRODUCTS)],
         samples=str(20 + i * 3), status=["Completed", "Pending", "Completed"][i % 3])
    for i in range(10)
]

MARKET_SURVEY_REPORT = [
    dict(surveyDate=DATES[i], mr=EMP[i][1], hq=EMP[i][2],
         competitorCompany=["GSK", "Micro Labs", "Alkem", "Glenmark", "Torrent"][i % 5],
         competitorBrand=["Calpol", "Dolo 650", "Pan 40", "Telma", "Shelcal"][i % 5],
         competitorProduct=["Paracetamol Syrup", "Paracetamol Tablet", "Pantoprazole Tablet", "Telmisartan Tablet", "Calcium Tablet"][i % 5],
         mrp=45 + i * 5, availability=["Available", "Short Supply", "Available"][i % 3],
         marketDemand=["High", "Medium", "Low"][i % 3], approval=["Approved", "Pending", "Approved"][i % 3])
    for i in range(10)
]

DOCTOR_COVERAGE_REPORT = [
    dict(doctor=DOCTORS[i], category=["Super Core", "Core", "Non Core"][i % 3],
         mr=EMP[i][1], plannedVisits=8, actualVisits=6 + i % 3, missedVisits=2 - i % 3,
         coveragePercentage=round((6 + i % 3) / 8 * 100, 1), status=["Visited", "Pending", "Visited"][i % 3])
    for i in range(10)
]

CHEMIST_COVERAGE_REPORT = [
    dict(chemist=CHEMISTS[i % len(CHEMISTS)], type=["Core", "Non Core"][i % 2], mr=EMP[i][1],
         plannedVisits=6, actualVisits=4 + i % 3, missedVisits=2 - i % 3,
         coveragePercentage=round((4 + i % 3) / 6 * 100, 1), status=["Visited", "Pending", "Visited"][i % 3])
    for i in range(10)
]

PRODUCTIVITY_DASHBOARD = [
    dict(rank=i + 1, employee=EMP[i][1], hq=EMP[i][2], doctorCalls=120 + i * 7,
         tourCompliance=round(85 + i * 1.2, 1), productivityScore=round(90 - i * 2.1, 1))
    for i in range(10)
]


def upsert(db, collection_name, records, key_fields):
    ops = []
    for rec in records:
        doc = {"tenantSlug": TENANT_SLUG, **rec}
        filt = {"tenantSlug": TENANT_SLUG, **{k: doc[k] for k in key_fields}}
        ops.append(UpdateOne(filt, {"$set": doc}, upsert=True))
    result = db[collection_name].bulk_write(ops, ordered=False)
    return len(ops), result.upserted_count, result.modified_count


def main():
    client = MongoClient(MONGO_URI)
    db = client.get_default_database()
    print(f"Connected to database: {db.name}  (tenantSlug={TENANT_SLUG})")

    jobs = [
        ("dcrEntry", DCR_ENTRY, ["date", "employee", "doctor"]),
        ("tourPlanEntry", TOUR_PLAN_ENTRY, ["tourDate", "employee"]),
        ("expenseEntry", EXPENSE_ENTRY, ["expenseDate", "employee", "billNumber"]),
        ("leaveEntry", LEAVE_ENTRY, ["employee", "fromDate", "toDate"]),
        ("campEntry", CAMP_ENTRY, ["campCode"]),
        ("marketSurveyEntry", MARKET_SURVEY_ENTRY, ["surveyDate", "employee", "competitorBrand"]),
        ("attendanceReport", ATTENDANCE_REPORT, ["date", "employeeCode"]),
        ("dcrSummaryReport", DCR_SUMMARY_REPORT, ["date", "employeeCode"]),
        ("tourPlanReport", TOUR_PLAN_REPORT, ["tourDate", "employeeCode"]),
        ("expenseReport", EXPENSE_REPORT, ["expenseDate", "employeeCode"]),
        ("leaveReport", LEAVE_REPORT, ["employee", "fromDate"]),
        ("campReport", CAMP_REPORT, ["campDate", "campName"]),
        ("marketSurveyReport", MARKET_SURVEY_REPORT, ["surveyDate", "mr", "competitorBrand"]),
        ("doctorCoverageReport", DOCTOR_COVERAGE_REPORT, ["doctor", "mr"]),
        ("chemistCoverageReport", CHEMIST_COVERAGE_REPORT, ["chemist", "mr"]),
        ("productivityDashboard", PRODUCTIVITY_DASHBOARD, ["employee"]),
    ]

    print("\n── Activity & report masters load summary ──────────────────")
    for collection_name, records, key_fields in jobs:
        total, upserted, modified = upsert(db, collection_name, records, key_fields)
        print(f"{collection_name:24s} rows: {total:2d}  inserted: {upserted:2d}  updated: {modified:2d}")
    print("─────────────────────────────────────────────────────────────")
    print("Done.")


if __name__ == "__main__":
    main()
