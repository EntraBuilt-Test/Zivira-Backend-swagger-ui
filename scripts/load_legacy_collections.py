"""
Loads sample data into the OLDER collections that several already-working admin
screens are wired to directly (not through the generic masters API):

  - Field Force              -> GET /company/employees        -> "employees" collection
  - Territory - Listed Doctor -> GET /company/doctors          -> "Doctor" collection ("doctors")
  - Territory Bulk Deactivation -> GET /company/territory/doctor-counts (aggregates "doctors")
  - Listed Doctor            -> GET /company/doctors           -> "doctors" collection
  - Chemist                  -> GET /company/dealers           -> "dealers" collection
  - Hospital                 -> GET /company/hospitals         -> "hospitals" collection
  - Unlisted Doctor          -> GET /company/unlisted-doctors  -> "unlisted_doctors" collection

These screens already have full working CRUD in the backend — they were just
never seeded. Field names below match each Mongoose model exactly.

Usage:
    DEMO_MONGODB_URI="mongodb+srv://.../demo_datas?..." \
    TENANT_SLUG="zivira-labs" \
    python3 load_legacy_collections.py

Safe to re-run — every record upserts on its natural unique key.
"""

import os
import sys
from pymongo import MongoClient, UpdateOne

MONGO_URI = os.environ.get("DEMO_MONGODB_URI")
TENANT_SLUG = os.environ.get("TENANT_SLUG", "zivira-labs")

if not MONGO_URI:
    print("Set DEMO_MONGODB_URI to your demo-datas cluster connection string.")
    sys.exit(1)

# ── employees ("Field Force" screen) ─────────────────────────────────────────
EMPLOYEES = [
    dict(employeeCode="EMP-MR-0001", name="Rahul Sharma", designation="Medical Representative", division="Zivira",
         territory="Chennai Central HQ", role="MR", dob="1992-04-12", email="rahul.sharma@zivira.com",
         phone="9840012345", joinDate="2019-06-01", city="Chennai", state="Tamil Nadu", country="India"),
    dict(employeeCode="EMP-MR-0002", name="Priya Nair", designation="Medical Representative", division="Zivira",
         territory="Kochi HQ", role="MR", dob="1993-08-23", email="priya.nair@zivira.com",
         phone="9840023456", joinDate="2020-01-15", city="Kochi", state="Kerala", country="India",
         reportingManager="EMP-ASM-0001"),
    dict(employeeCode="EMP-MR-0003", name="Anil Anjaneya", designation="Medical Representative", division="Astra",
         territory="Hyderabad HQ", role="MR", dob="1991-11-02", email="anil.anjaneya@zivira.com",
         phone="9840034567", joinDate="2018-09-10", city="Hyderabad", state="Telangana", country="India",
         reportingManager="EMP-ASM-0002"),
    dict(employeeCode="EMP-ASM-0001", name="Karthik Raja", designation="Area Sales Manager", division="Zivira",
         territory="Chennai Central HQ", role="ABM", dob="1988-02-17", email="karthik.raja@zivira.com",
         phone="9840045678", joinDate="2015-03-20", city="Chennai", state="Tamil Nadu", country="India",
         reportingManager="EMP-RSM-0001"),
    dict(employeeCode="EMP-MR-0004", name="Divya Menon", designation="Medical Representative", division="Aura",
         territory="Coimbatore HQ", role="MR", dob="1994-06-30", email="divya.menon@zivira.com",
         phone="9840056789", joinDate="2021-07-05", city="Coimbatore", state="Tamil Nadu", country="India",
         reportingManager="EMP-ASM-0001"),
    dict(employeeCode="EMP-MR-0005", name="Suresh Kumar", designation="Medical Representative", division="Astra",
         territory="Bengaluru HQ", role="MR", dob="1990-01-19", email="suresh.kumar@zivira.com",
         phone="9840067890", joinDate="2017-11-12", city="Bengaluru", state="Karnataka", country="India",
         reportingManager="EMP-ASM-0002"),
    dict(employeeCode="EMP-RSM-0001", name="Meera Iyer", designation="Regional Sales Manager", division="Zivira",
         territory="Chennai Central HQ", role="RBM", dob="1985-09-08", email="meera.iyer@zivira.com",
         phone="9840078901", joinDate="2012-05-01", city="Chennai", state="Tamil Nadu", country="India"),
    dict(employeeCode="EMP-MR-0006", name="Arjun Reddy", designation="Medical Representative", division="Aura",
         territory="Vijayawada HQ", role="MR", dob="1993-03-25", email="arjun.reddy@zivira.com",
         phone="9840089012", joinDate="2020-08-18", city="Vijayawada", state="Andhra Pradesh", country="India",
         reportingManager="EMP-ASM-0002"),
    dict(employeeCode="EMP-MR-0007", name="Sneha Patel", designation="Medical Representative", division="Zivira",
         territory="Mumbai HQ", role="MR", dob="1995-12-14", email="sneha.patel@zivira.com",
         phone="9840090123", joinDate="2022-02-01", city="Mumbai", state="Maharashtra", country="India",
         reportingManager="EMP-ASM-0001"),
    dict(employeeCode="EMP-ASM-0002", name="Vikram Singh", designation="Zonal Sales Manager", division="Astra",
         territory="Delhi HQ", role="ZBM", dob="1987-07-04", email="vikram.singh@zivira.com",
         phone="9840001234", joinDate="2014-10-09", city="New Delhi", state="Delhi", country="India",
         reportingManager="EMP-RSM-0001"),
]

# ── doctors ("Territory - Listed Doctor" / "Listed Doctor" / territory counts) ──
DOCTORS = [
    dict(name="Dr. Rajesh Kumar", specialty="General Physician", category="A", state="Tamil Nadu", city="Chennai",
         territory="T. Nagar Patch", mappedEmployeeCode="EMP-MR-0001", mappedEmployeeName="Rahul Sharma",
         doctorCode="DOC0001", qualification="MBBS, MD", registrationNo="TNMC123456", clinicName="Kumar Clinic",
         phone="9884411111", email="rajesh.kumar@kumarclinic.in"),
    dict(name="Dr. Priya Nair", specialty="Pediatrics", category="A", state="Kerala", city="Kochi",
         territory="Kaloor Patch", mappedEmployeeCode="EMP-MR-0002", mappedEmployeeName="Priya Nair",
         doctorCode="DOC0002", qualification="MBBS, MD (Pediatrics)", registrationNo="KMC234567",
         clinicName="Nair Children's Hospital", phone="9884422222", email="priya.nair@nairhospital.in"),
    dict(name="Dr. Ananya Mehta", specialty="Cardiologist", category="A", state="Telangana", city="Hyderabad",
         territory="Kukatpally Patch", mappedEmployeeCode="EMP-MR-0003", mappedEmployeeName="Anil Anjaneya",
         doctorCode="DOC0003", qualification="MBBS, DM (Cardiology)", registrationNo="TSMC345678",
         clinicName="Mehta Heart Centre", phone="9884433333", email="ananya.mehta@mehtaheart.in"),
    dict(name="Dr. Vivek Menon", specialty="Diabetologist", category="B", state="Tamil Nadu", city="Coimbatore",
         territory="RS Puram Patch", mappedEmployeeCode="EMP-MR-0004", mappedEmployeeName="Divya Menon",
         doctorCode="DOC0004", qualification="MBBS, MD (Medicine)", registrationNo="TNMC456789",
         clinicName="Menon Diabetes Care", phone="9884444444", email="vivek.menon@menondiabetes.in"),
    dict(name="Dr. Kavitha Rao", specialty="Pulmonologist", category="B", state="Tamil Nadu", city="Chennai",
         territory="T. Nagar Patch", mappedEmployeeCode="EMP-MR-0001", mappedEmployeeName="Rahul Sharma",
         doctorCode="DOC0005", qualification="MBBS, MD (Pulmonology)", registrationNo="TNMC567890",
         clinicName="Rao Lung Clinic", phone="9884455555", email="kavitha.rao@raolung.in"),
    dict(name="Dr. Suresh Babu", specialty="Gastroenterologist", category="A", state="Karnataka", city="Bengaluru",
         territory="Koramangala Patch", mappedEmployeeCode="EMP-MR-0005", mappedEmployeeName="Suresh Kumar",
         doctorCode="DOC0006", qualification="MBBS, DM (Gastro)", registrationNo="KMC678901",
         clinicName="Babu Gastro Centre", phone="9884466666", email="suresh.babu@babugastro.in"),
    dict(name="Dr. Lakshmi Narayan", specialty="Dermatologist", category="C", state="Tamil Nadu", city="Chennai",
         territory="Anna Nagar Patch", mappedEmployeeCode="EMP-MR-0001", mappedEmployeeName="Rahul Sharma",
         doctorCode="DOC0007", qualification="MBBS, MD (Skin & VD)", registrationNo="TNMC789012",
         clinicName="Narayan Skin Clinic", phone="9884477777", email="lakshmi.narayan@narayanskin.in"),
    dict(name="Dr. Arvind Rao", specialty="Neurologist", category="B", state="Andhra Pradesh", city="Vijayawada",
         territory="Benz Circle Patch", mappedEmployeeCode="EMP-MR-0006", mappedEmployeeName="Arjun Reddy",
         doctorCode="DOC0008", qualification="MBBS, DM (Neurology)", registrationNo="APMC890123",
         clinicName="Rao Neuro Centre", phone="9884488888", email="arvind.rao@raoneuro.in"),
    dict(name="Dr. Deepa Krishnan", specialty="Nephrologist", category="A", state="Maharashtra", city="Mumbai",
         territory="Andheri Patch", mappedEmployeeCode="EMP-MR-0007", mappedEmployeeName="Sneha Patel",
         doctorCode="DOC0009", qualification="MBBS, DM (Nephrology)", registrationNo="GMC901234",
         clinicName="Krishnan Kidney Care", phone="9884499999", email="deepa.krishnan@krishnankidney.in"),
    dict(name="Dr. Manoj Tiwari", specialty="Orthopaedic Surgeon", category="C", state="Delhi", city="New Delhi",
         territory="Karol Bagh Patch", mappedEmployeeCode="EMP-ASM-0002", mappedEmployeeName="Vikram Singh",
         doctorCode="DOC0010", qualification="MBBS, MS (Ortho)", registrationNo="DMC012345",
         clinicName="Tiwari Ortho Hospital", phone="9884400000", email="manoj.tiwari@tiwariortho.in"),
]

# ── dealers ("Chemist" screen) ───────────────────────────────────────────────
DEALERS = [
    dict(sourceSNo=1, dealerName="Apollo Pharmacy - T. Nagar", employeeCode="EMP-MR-0001", employeeName="Rahul Sharma",
         patchName="T. Nagar Patch", city="Chennai", state="Tamil Nadu", country="India", pincode="600017",
         contactPersonName="Mr. Suresh Kumar", dealerPhone="+91 98765 11111", dealerEmail="suresh@medlinepharma.com"),
    dict(sourceSNo=2, dealerName="MedPlus - Anna Nagar", employeeCode="EMP-MR-0001", employeeName="Rahul Sharma",
         patchName="Anna Nagar Patch", city="Chennai", state="Tamil Nadu", country="India", pincode="600040",
         contactPersonName="Mr. Prakash", dealerPhone="+91 98765 22222", dealerEmail="prakash@southpharma.com"),
    dict(sourceSNo=3, dealerName="Lifecare Pharmacy - RS Puram", employeeCode="EMP-MR-0004", employeeName="Divya Menon",
         patchName="RS Puram Patch", city="Coimbatore", state="Tamil Nadu", country="India", pincode="641002",
         contactPersonName="Mr. Elango", dealerPhone="+91 98765 33333", dealerEmail="elango@konguagencies.com"),
    dict(sourceSNo=4, dealerName="Trust Pharmacy - Kaloor", employeeCode="EMP-MR-0002", employeeName="Priya Nair",
         patchName="Kaloor Patch", city="Kochi", state="Kerala", country="India", pincode="682017",
         contactPersonName="Mr. Manjunath", dealerPhone="+91 98765 44444", dealerEmail="manjunath@karnatakadrug.com"),
    dict(sourceSNo=5, dealerName="Wellness Forever - Koramangala", employeeCode="EMP-MR-0005", employeeName="Suresh Kumar",
         patchName="Koramangala Patch", city="Bengaluru", state="Karnataka", country="India", pincode="560034",
         contactPersonName="Mr. Ravi Teja", dealerPhone="+91 98765 55555", dealerEmail="raviteja@deccanpharma.com"),
    dict(sourceSNo=6, dealerName="Care Chemist - Kukatpally", employeeCode="EMP-MR-0003", employeeName="Anil Anjaneya",
         patchName="Kukatpally Patch", city="Hyderabad", state="Telangana", country="India", pincode="500072",
         contactPersonName="Mr. Krishna Rao", dealerPhone="+91 98765 66666", dealerEmail="krishnarao@krishnamedical.com"),
    dict(sourceSNo=7, dealerName="City Medicals - Benz Circle", employeeCode="EMP-MR-0006", employeeName="Arjun Reddy",
         patchName="Benz Circle Patch", city="Vijayawada", state="Andhra Pradesh", country="India", pincode="520010",
         contactPersonName="Mr. Sanjay Deshmukh", dealerPhone="+91 98765 77777", dealerEmail="sanjay@konkanpharma.com"),
    dict(sourceSNo=8, dealerName="Noble Chemist - Andheri", employeeCode="EMP-ASM-0002", employeeName="Vikram Singh",
         patchName="Andheri Patch", city="Mumbai", state="Maharashtra", country="India", pincode="400058",
         contactPersonName="Mr. Rohit Verma", dealerPhone="+91 98765 88888", dealerEmail="rohit@capitaldrug.com"),
    dict(sourceSNo=9, dealerName="Global Pharmacy - Karol Bagh", employeeCode="EMP-ASM-0002", employeeName="Vikram Singh",
         patchName="Karol Bagh Patch", city="New Delhi", state="Delhi", country="India", pincode="110005",
         contactPersonName="Mr. Somnath Das", dealerPhone="+91 98765 99999", dealerEmail="somnath@bengalpharma.com"),
    dict(sourceSNo=10, dealerName="Health Plus - Salt Lake", employeeCode="EMP-MR-0007", employeeName="Sneha Patel",
         patchName="Salt Lake Patch", city="Kolkata", state="West Bengal", country="India", pincode="700064",
         contactPersonName="Mr. Kiran Shah", dealerPhone="+91 98765 00000", dealerEmail="kiran@gujaratmedical.com"),
]

# ── hospitals ("Hospital" screen) ────────────────────────────────────────────
HOSPITALS = [
    dict(hospitalCode="HOSP0001", hospitalName="Apollo Hospital", type="Private", city="Chennai", medicalRepresentative="Rahul Sharma"),
    dict(hospitalCode="HOSP0002", hospitalName="Government General Hospital", type="Government", city="Chennai", medicalRepresentative="Rahul Sharma"),
    dict(hospitalCode="HOSP0003", hospitalName="Amrita Institute of Medical Sciences", type="Trust", city="Kochi", medicalRepresentative="Priya Nair"),
    dict(hospitalCode="HOSP0004", hospitalName="Yashoda Hospitals", type="Private", city="Hyderabad", medicalRepresentative="Anil Anjaneya"),
    dict(hospitalCode="HOSP0005", hospitalName="Kovai Medical Center", type="Private", city="Coimbatore", medicalRepresentative="Divya Menon"),
    dict(hospitalCode="HOSP0006", hospitalName="Manipal Hospital", type="Private", city="Bengaluru", medicalRepresentative="Suresh Kumar"),
    dict(hospitalCode="HOSP0007", hospitalName="Government District Hospital", type="Government", city="Vijayawada", medicalRepresentative="Arjun Reddy"),
    dict(hospitalCode="HOSP0008", hospitalName="Lilavati Hospital", type="Private", city="Mumbai", medicalRepresentative="Sneha Patel"),
    dict(hospitalCode="HOSP0009", hospitalName="All India Institute of Medical Sciences", type="Government", city="New Delhi", medicalRepresentative="Vikram Singh"),
    dict(hospitalCode="HOSP0010", hospitalName="Ramakrishna Mission Sevashrama", type="Trust", city="Chennai", medicalRepresentative="Meera Iyer"),
]

# ── unlisted_doctors ("Unlisted Doctor" screen) ──────────────────────────────
UNLISTED_DOCTORS = [
    dict(tempCode="TMP0001", name="Dr. Ravi Chandran", specialty="ENT Specialist", city="Chennai", mr="Rahul Sharma",
         clinicName="Chandran ENT Clinic", area="T. Nagar", state="Tamil Nadu", pinCode="600017",
         patch="T. Nagar Patch", hq="Chennai Central HQ", mobile="9884511111", email="ravi.chandran@gmail.com",
         visitFrequency="Monthly", potential="Medium", status="Pending"),
    dict(tempCode="TMP0002", name="Dr. Meenakshi Sundaram", specialty="Ophthalmologist", city="Chennai", mr="Rahul Sharma",
         clinicName="Sundaram Eye Care", area="Anna Nagar", state="Tamil Nadu", pinCode="600040",
         patch="Anna Nagar Patch", hq="Chennai North HQ", mobile="9884522222", email="meenakshi.s@gmail.com",
         visitFrequency="Fortnightly", potential="High", status="Pending"),
    dict(tempCode="TMP0003", name="Dr. Joseph Thomas", specialty="Urologist", city="Kochi", mr="Priya Nair",
         clinicName="Thomas Urology Center", area="Kaloor", state="Kerala", pinCode="682017",
         patch="Kaloor Patch", hq="Kochi HQ", mobile="9884533333", email="joseph.thomas@gmail.com",
         visitFrequency="Monthly", potential="Medium", status="Approved", approvedBy="Meera Iyer"),
    dict(tempCode="TMP0004", name="Dr. Srinivas Rao", specialty="Endocrinologist", city="Hyderabad", mr="Anil Anjaneya",
         clinicName="Rao Endocrine Clinic", area="Kukatpally", state="Telangana", pinCode="500072",
         patch="Kukatpally Patch", hq="Hyderabad HQ", mobile="9884544444", email="srinivas.rao@gmail.com",
         visitFrequency="Monthly", potential="High", status="Pending"),
    dict(tempCode="TMP0005", name="Dr. Kalaivani Murugan", specialty="Gynaecologist", city="Coimbatore", mr="Divya Menon",
         clinicName="Murugan Women's Clinic", area="RS Puram", state="Tamil Nadu", pinCode="641002",
         patch="RS Puram Patch", hq="Coimbatore HQ", mobile="9884555555", email="kalaivani.m@gmail.com",
         visitFrequency="Fortnightly", potential="Medium", status="Pending"),
    dict(tempCode="TMP0006", name="Dr. Nagesh Bhat", specialty="Psychiatrist", city="Bengaluru", mr="Suresh Kumar",
         clinicName="Bhat Mind Wellness", area="Koramangala", state="Karnataka", pinCode="560034",
         patch="Koramangala Patch", hq="Bengaluru HQ", mobile="9884566666", email="nagesh.bhat@gmail.com",
         visitFrequency="Monthly", potential="Low", status="Rejected", approvedBy="Vikram Singh"),
    dict(tempCode="TMP0007", name="Dr. Padma Vasireddy", specialty="Rheumatologist", city="Vijayawada", mr="Arjun Reddy",
         clinicName="Vasireddy Joint Clinic", area="Benz Circle", state="Andhra Pradesh", pinCode="520010",
         patch="Benz Circle Patch", hq="Vijayawada HQ", mobile="9884577777", email="padma.v@gmail.com",
         visitFrequency="Monthly", potential="Medium", status="Pending"),
    dict(tempCode="TMP0008", name="Dr. Farhan Sheikh", specialty="Oncologist", city="Mumbai", mr="Sneha Patel",
         clinicName="Sheikh Cancer Care", area="Andheri", state="Maharashtra", pinCode="400058",
         patch="Andheri Patch", hq="Mumbai HQ", mobile="9884588888", email="farhan.sheikh@gmail.com",
         visitFrequency="Fortnightly", potential="High", status="Pending"),
    dict(tempCode="TMP0009", name="Dr. Harpreet Kaur", specialty="Pulmonologist", city="New Delhi", mr="Vikram Singh",
         clinicName="Kaur Chest Clinic", area="Karol Bagh", state="Delhi", pinCode="110005",
         patch="Karol Bagh Patch", hq="Delhi HQ", mobile="9884599999", email="harpreet.kaur@gmail.com",
         visitFrequency="Monthly", potential="Medium", status="Approved", approvedBy="Meera Iyer"),
    dict(tempCode="TMP0010", name="Dr. Ananta Das", specialty="Nephrologist", city="Kolkata", mr="Sneha Patel",
         clinicName="Das Kidney Clinic", area="Salt Lake", state="West Bengal", pinCode="700064",
         patch="Salt Lake Patch", hq="Kolkata HQ", mobile="9884500000", email="ananta.das@gmail.com",
         visitFrequency="Monthly", potential="Medium", status="Pending"),
]


# ── expenseApproval (generic master, "Expense Approval" screen) ─────────────
# Separate claim queue from managerTravelApproval so the two approval screens
# don't show each other's rows.
EXPENSE_APPROVALS = [
    dict(employee="Rahul Sharma", claimId="EXP-CLM-0001", amount=1450, status="Approved"),
    dict(employee="Priya Nair", claimId="EXP-CLM-0002", amount=890, status="Pending"),
    dict(employee="Anil Anjaneya", claimId="EXP-CLM-0003", amount=2100, status="Approved"),
    dict(employee="Divya Menon", claimId="EXP-CLM-0004", amount=610, status="Pending"),
    dict(employee="Suresh Kumar", claimId="EXP-CLM-0005", amount=1320, status="Rejected"),
    dict(employee="Arjun Reddy", claimId="EXP-CLM-0006", amount=1780, status="Approved"),
    dict(employee="Sneha Patel", claimId="EXP-CLM-0007", amount=2350, status="Pending"),
    dict(employee="Vikram Singh", claimId="EXP-CLM-0008", amount=2900, status="Approved"),
    dict(employee="Karthik Raja", claimId="EXP-CLM-0009", amount=540, status="Approved"),
    dict(employee="Meera Iyer", claimId="EXP-CLM-0010", amount=980, status="Pending"),
]


# ── sfc ("SFC Updation" dropdown, keyed by HQ) ───────────────────────────────
SFC_ROWS = [
    dict(sourceSNo=1, employeeName="Rahul Sharma", employeeCode="EMP-MR-0001", hq="Chennai Central HQ",
         patchName="T. Nagar Patch", typeRaw="Tour", oneWayKms=12, region="South"),
    dict(sourceSNo=2, employeeName="Priya Nair", employeeCode="EMP-MR-0002", hq="Kochi HQ",
         patchName="Kaloor Patch", typeRaw="Outstation Work", oneWayKms=45, region="South"),
    dict(sourceSNo=3, employeeName="Anil Anjaneya", employeeCode="EMP-MR-0003", hq="Hyderabad HQ",
         patchName="Kukatpally Patch", typeRaw="Tour", oneWayKms=18, region="South"),
    dict(sourceSNo=4, employeeName="Karthik Raja", employeeCode="EMP-ASM-0001", hq="Chennai Central HQ",
         patchName="Anna Nagar Patch", typeRaw="Outstation Excursion", oneWayKms=30, region="South"),
    dict(sourceSNo=5, employeeName="Divya Menon", employeeCode="EMP-MR-0004", hq="Coimbatore HQ",
         patchName="RS Puram Patch", typeRaw="Tour", oneWayKms=10, region="South"),
    dict(sourceSNo=6, employeeName="Suresh Kumar", employeeCode="EMP-MR-0005", hq="Bengaluru HQ",
         patchName="Koramangala Patch", typeRaw="Tour", oneWayKms=15, region="South"),
    dict(sourceSNo=7, employeeName="Meera Iyer", employeeCode="EMP-RSM-0001", hq="Chennai Central HQ",
         patchName="T. Nagar Patch", typeRaw="Admin", oneWayKms=5, region="South"),
    dict(sourceSNo=8, employeeName="Arjun Reddy", employeeCode="EMP-MR-0006", hq="Vijayawada HQ",
         patchName="Benz Circle Patch", typeRaw="Tour", oneWayKms=22, region="South"),
    dict(sourceSNo=9, employeeName="Sneha Patel", employeeCode="EMP-MR-0007", hq="Mumbai HQ",
         patchName="Andheri Patch", typeRaw="Outstation Work", oneWayKms=60, region="West"),
    dict(sourceSNo=10, employeeName="Vikram Singh", employeeCode="EMP-ASM-0002", hq="Delhi HQ",
         patchName="Karol Bagh Patch", typeRaw="Tour", oneWayKms=14, region="North"),
]

# ── expenses ("Work Type Wise - Allowance Fix" dropdown, keyed by dailyWork) ─
EXPENSE_ROWS = [
    dict(sourceSNo=1, role="Medical Representative", listOfExpenseTypes="Local Conveyance", station="Chennai",
         metroType="Metro", amountNC=300, dailyWork="Daily", frequency="Daily"),
    dict(sourceSNo=2, role="Medical Representative", listOfExpenseTypes="Daily Allowance", station="Chennai",
         metroType="Metro", amountNC=500, dailyWork="Daily", frequency="Daily"),
    dict(sourceSNo=3, role="Medical Representative", listOfExpenseTypes="Daily Allowance", station="Coimbatore",
         metroType="Non-Metro", amountNC=350, dailyWork="Daily", frequency="Daily"),
    dict(sourceSNo=4, role="Area Sales Manager", listOfExpenseTypes="Local Conveyance", station="Chennai",
         metroType="Metro", amountNC=500, dailyWork="Daily", frequency="Daily"),
    dict(sourceSNo=5, role="Area Sales Manager", listOfExpenseTypes="Hotel Accommodation", station="Mumbai",
         metroType="Metro", amountNC=3500, dailyWork="Monthly", frequency="Per Night"),
    dict(sourceSNo=6, role="Regional Sales Manager", listOfExpenseTypes="Hotel Accommodation", station="Hyderabad",
         metroType="Metro", amountNC=4500, dailyWork="Monthly", frequency="Per Night"),
    dict(sourceSNo=7, role="Medical Representative", listOfExpenseTypes="Transit Allowance", station="Mumbai",
         metroType="Metro", amountNC=1000, dailyWork="Daily", frequency="Per Trip"),
    dict(sourceSNo=8, role="Medical Representative", listOfExpenseTypes="Telephone Allowance", station="Chennai",
         metroType="Metro", amountNC=500, dailyWork="Monthly", frequency="Monthly"),
    dict(sourceSNo=9, role="Area Sales Manager", listOfExpenseTypes="Internet Reimbursement", station="Bengaluru",
         metroType="Metro", amountNC=750, dailyWork="Monthly", frequency="Monthly"),
    dict(sourceSNo=10, role="Medical Representative", listOfExpenseTypes="Meeting Allowance", station="Vijayawada",
         metroType="Non-Metro", amountNC=400, dailyWork="Daily", frequency="Per Meeting"),
]


# ── expenseReports (generic master, "Reports" screen under Manager Expense) ──
EXPENSE_REPORTS = [
    dict(monthly="January 2026", team="Zivira Field Team", budget=250000),
    dict(monthly="January 2026", team="Astra Field Team", budget=210000),
    dict(monthly="January 2026", team="Aura Field Team", budget=180000),
    dict(monthly="February 2026", team="Zivira Field Team", budget=260000),
    dict(monthly="February 2026", team="Astra Field Team", budget=215000),
    dict(monthly="February 2026", team="Aura Field Team", budget=185000),
    dict(monthly="March 2026", team="Zivira Field Team", budget=270000),
    dict(monthly="March 2026", team="Astra Field Team", budget=220000),
    dict(monthly="March 2026", team="Aura Field Team", budget=190000),
    dict(monthly="March 2026", team="South Zone Managers", budget=95000),
]

# ── personalInformationView (generic master, read-only "Personal - View") ───
PERSONAL_INFORMATION_VIEW = [
    dict(employeeCode="EMP-MR-0001", employeeName="Rahul Sharma", contactNo="9840012345",
         personalEmail="rahul.sharma.personal@gmail.com", panNo="BNZPS1234K", aadharNo="XXXX XXXX 4587", status="Active"),
    dict(employeeCode="EMP-MR-0002", employeeName="Priya Nair", contactNo="9840023456",
         personalEmail="priya.nair.personal@gmail.com", panNo="CNZPN5678L", aadharNo="XXXX XXXX 7845", status="Active"),
    dict(employeeCode="EMP-MR-0003", employeeName="Anil Anjaneya", contactNo="9840034567",
         personalEmail="anil.anjaneya.personal@gmail.com", panNo="DNZPA9012M", aadharNo="XXXX XXXX 1236", status="Active"),
    dict(employeeCode="EMP-ASM-0001", employeeName="Karthik Raja", contactNo="9840045678",
         personalEmail="karthik.raja.personal@gmail.com", panNo="ENZPR3456N", aadharNo="XXXX XXXX 3698", status="Active"),
    dict(employeeCode="EMP-MR-0004", employeeName="Divya Menon", contactNo="9840056789",
         personalEmail="divya.menon.personal@gmail.com", panNo="FNZPM7890O", aadharNo="XXXX XXXX 7412", status="Active"),
    dict(employeeCode="EMP-MR-0005", employeeName="Suresh Kumar", contactNo="9840067890",
         personalEmail="suresh.kumar.personal@gmail.com", panNo="GNZPK2345P", aadharNo="XXXX XXXX 8523", status="Active"),
    dict(employeeCode="EMP-RSM-0001", employeeName="Meera Iyer", contactNo="9840078901",
         personalEmail="meera.iyer.personal@gmail.com", panNo="HNZPI6789Q", aadharNo="XXXX XXXX 9634", status="Active"),
    dict(employeeCode="EMP-MR-0006", employeeName="Arjun Reddy", contactNo="9840089012",
         personalEmail="arjun.reddy.personal@gmail.com", panNo="INZPR0123R", aadharNo="XXXX XXXX 1597", status="Active"),
    dict(employeeCode="EMP-MR-0007", employeeName="Sneha Patel", contactNo="9840090123",
         personalEmail="sneha.patel.personal@gmail.com", panNo="JNZPP4567S", aadharNo="XXXX XXXX 3579", status="Active"),
    dict(employeeCode="EMP-ASM-0002", employeeName="Vikram Singh", contactNo="9840001234",
         personalEmail="vikram.singh.personal@gmail.com", panNo="KNZPS8901T", aadharNo="XXXX XXXX 2468", status="Active"),
]


# ── attendance enrichment: adds Employee Code to the 10 rows already loaded ──
# by load_masters_data.py (which only had Date/Employee/HQ/etc, no code column
# in the source spreadsheet). Same (date, employee) key, so this just adds the
# missing field via upsert rather than creating duplicate rows.
ATTENDANCE_ENRICHMENT = [
    dict(date="2026-01-05", employee="Rahul Sharma", employeeCode="EMP-MR-0001"),
    dict(date="2026-01-05", employee="Priya Nair", employeeCode="EMP-MR-0002"),
    dict(date="2026-01-05", employee="Anil Anjaneya", employeeCode="EMP-MR-0003"),
    dict(date="2026-01-06", employee="Divya Menon", employeeCode="EMP-MR-0004"),
    dict(date="2026-01-06", employee="Suresh Kumar", employeeCode="EMP-MR-0005"),
    dict(date="2026-01-06", employee="Karthik Raja", employeeCode="EMP-ASM-0001"),
    dict(date="2026-01-07", employee="Arjun Reddy", employeeCode="EMP-MR-0006"),
    dict(date="2026-01-07", employee="Sneha Patel", employeeCode="EMP-MR-0007"),
    dict(date="2026-01-07", employee="Vikram Singh", employeeCode="EMP-ASM-0002"),
    dict(date="2026-01-08", employee="Meera Iyer", employeeCode="EMP-RSM-0001"),
]

# ── allowanceFixation (generic master, merges old Metro/Non-Metro Allowance) ─
ALLOWANCE_FIXATION = [
    dict(location="Chennai", type="Metro", dailyAllowance="₹500"),
    dict(location="Bengaluru", type="Metro", dailyAllowance="₹600"),
    dict(location="Hyderabad", type="Metro", dailyAllowance="₹550"),
    dict(location="Mumbai", type="Metro", dailyAllowance="₹700"),
    dict(location="Delhi", type="Metro", dailyAllowance="₹700"),
    dict(location="Kolkata", type="Metro", dailyAllowance="₹600"),
    dict(location="Coimbatore", type="Non-Metro", dailyAllowance="₹350"),
    dict(location="Madurai", type="Non-Metro", dailyAllowance="₹300"),
    dict(location="Kochi", type="Non-Metro", dailyAllowance="₹350"),
    dict(location="Vijayawada", type="Non-Metro", dailyAllowance="₹300"),
]

# ── sfc: add explicit Status so the SFC View screen's dropdown pre-selects
# correctly on edit (matches registry's ["Active","Inactive"] casing exactly).
for _row in SFC_ROWS:
    _row.setdefault("status", "Active")


def upsert(db, collection_name, records, key_fields):
    ops = []
    for rec in records:
        doc = {"tenantSlug": TENANT_SLUG, **rec}
        if "status" not in doc:
            doc["status"] = "Active"
        filt = {"tenantSlug": TENANT_SLUG, **{k: doc[k] for k in key_fields}}
        ops.append(UpdateOne(filt, {"$set": doc}, upsert=True))
    result = db[collection_name].bulk_write(ops, ordered=False)
    return len(ops), result.upserted_count, result.modified_count


def main():
    client = MongoClient(MONGO_URI)
    db = client.get_default_database()
    print(f"Connected to database: {db.name}  (tenantSlug={TENANT_SLUG})")

    jobs = [
        ("employees", EMPLOYEES, ["employeeCode"]),
        ("doctors", DOCTORS, ["doctorCode"]),   # Mongoose auto-pluralizes model("Doctor", ...) to "doctors"
        ("dealers", DEALERS, ["sourceSNo"]),
        ("hospitals", HOSPITALS, ["hospitalCode"]),
        ("unlisted_doctors", UNLISTED_DOCTORS, ["tempCode"]),
        ("expenseApproval", EXPENSE_APPROVALS, ["claimId"]),
        ("sfc", SFC_ROWS, ["sourceSNo"]),
        ("expenses", EXPENSE_ROWS, ["role", "listOfExpenseTypes", "station", "metroType"]),
        ("expenseReports", EXPENSE_REPORTS, ["monthly", "team"]),
        ("personalInformationView", PERSONAL_INFORMATION_VIEW, ["employeeCode"]),
        ("attendance", ATTENDANCE_ENRICHMENT, ["date", "employee"]),
        ("allowanceFixation", ALLOWANCE_FIXATION, ["location"]),
    ]

    print("\n── Legacy collections load summary ─────────────────────────")
    for collection_name, records, key_fields in jobs:
        total, upserted, modified = upsert(db, collection_name, records, key_fields)
        print(f"{collection_name:20s} rows: {total:2d}  inserted: {upserted:2d}  updated: {modified:2d}")
    print("─────────────────────────────────────────────────────────────")
    print("Done.")


if __name__ == "__main__":
    main()
