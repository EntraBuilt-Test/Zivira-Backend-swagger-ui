# Builds Listed_Doctor_Upload_READY_TO_UPLOAD.xlsx: the user's own test file (Listed_Doctor_Upload_Tool_2.xlsx), with only the invalid values changed.
# User Name -> real employee codes from 06_Upload_SalesforceUpload.xlsx; Category (tier) -> Nil / CORE / N CORE / S CORE; the old A/B "Category" values move to Class.
# Rows 1-4 are the user's own doctors (names / speciality / qualification as visible in the screenshots); rows 5-10 are real doctors of the demo dump 01_Customer_ListedDoctorUpload.xlsx.
import sys, openpyxl
from openpyxl.styles import PatternFill, Font
H = ["SI No","User Name","Listed Doctor Name","Territory/Cluster(For DCR)","City Name(For Expense)","Speciality","Category","Qualification","Class","Territory Type","Address","EMail ID","Mobile No","Gender","State"]
TN, KL = "Tamil Nadu", "Kerala"
R = [
 ["E0144","Dr. Anil Kumar","TRICHY","TRICHY","Cardiologist","CORE","MD, DM","A","HQ","Trichy",             "M","Tamil Nadu"],
 ["E0144","Dr. Meena Iyer","TRICHY","TRICHY","Gynecologist","N CORE","MBBS, MS","A","HQ","Trichy",         "F","Tamil Nadu"],
 ["E0373","Dr. Suresh Babu","COIMBATORE","COIMBATORE","General Physician","Nil","MBBS","B","HQ","Coimbatore","M","Tamil Nadu"],
 ["E0251","Dr. Lakshmi Narayanan","MADURAI","MADURAI","Pediatrician","S CORE","MD","A","HQ","Madurai",       "F","Tamil Nadu"],
 ["E0272","ADITHYA SURENDRAN","VADAKARA","VADAKARA","MSO","N CORE","MS","C","EX","AHALIA EYE HOSPITAL VADAKRA","M","Kerala"],
 ["E0272","AKSHAYA ASHOK","CANNANORE","CANNANORE","PGR","N CORE","MBBS DNB DO","B","HQ","DR BINUS SUNRISE HOSPITAL","F","Kerala"],
 ["E0331","AADITH BHASKER","Kalpetta","Kalpetta","MSO","N CORE","MBBS","B","EX","Ahalya eye foundation","M","Kerala"],
 ["E0331","AJOY MOHAN","Calicut","Calicut","OPT","CORE","MBBS,MS,FICO","A","HQ","Malabar Eye Hospital , calicut","M","Kerala"],
 ["E0248","ABDHUL NISAR","NILAMBUR","NILAMBUR","OPT","N CORE","MBBS","C","EX","NETHRA EYE HOSPITAL, WANDOOR","M","Kerala"],
 ["E0248","Abdul shameer","PERINTHALMANNA","PERINTHALMANNA","OCLP","Nil","MD","C","HQ","Abate","M","Kerala"],
]
wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Listed Doctor Upload"
ws.append(H)
for c in ws[1]: c.fill = PatternFill("solid", fgColor="FFFF00"); c.font = Font(bold=True)
for i, (code, name, terr, city, spec, tier, qual, cls, tt, addr, g, st) in enumerate(R, 1):
    slug = "".join(ch for ch in name.lower() if ch.isalpha() or ch == " ").replace("dr ", "").strip().replace(" ", ".")
    ws.append([i, code, name, terr, city, spec, tier, qual, cls, tt, addr, f"dr.{slug}@clinic-demo.in", f"98765{43210+i:05d}", {"M":"Male","F":"Female"}[g], st])
for col, w in zip("ABCDEFGHIJKLMNO", [7,11,26,22,22,18,10,18,7,13,34,34,13,9,13]): ws.column_dimensions[col].width = w
wb.save(sys.argv[1])
