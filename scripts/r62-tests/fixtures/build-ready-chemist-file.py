# Builds Chemist_Upload_READY_TO_UPLOAD.xlsx from the demo pack (02_Customer_ChemistsUpload.xlsx): 10 real chemists of three real employees
# (E0038 / E0255 / E0308 of 06_Upload_SalesforceUpload.xlsx), with the columns "Generate Excel" produces when these optional boxes are ticked:
# Category, Class, Address, City Name, Contact person, Mobile No, EMail ID, State  (+ the always-included SI No, User Name, Chemist Name, Territory).
# Category is derived from the name (Hospital Pharmacy / Retail Pharmacy); Class A/B/C is assigned in turn; contact person, mobile and email are demo placeholders.
import sys, openpyxl
from openpyxl.styles import PatternFill, Font
src, out = sys.argv[1], sys.argv[2]
rows = list(openpyxl.load_workbook(src, read_only=True).active.iter_rows(values_only=True)); h = rows[0]; ix = {k: i for i, k in enumerate(h)}
want = {"E0038": 4, "E0255": 3, "E0308": 3}; seen = set(); pick = []
for r in rows[1:]:
    e = r[ix["Employee Code"]]; name = (r[ix["Chemists Name"]] or "").strip(); terr = (r[ix["Territory"]] or "").strip()
    if e in want and want[e] > 0 and name and terr and r[ix["Address"]] and (e, name.lower(), terr.lower()) not in seen:
        seen.add((e, name.lower(), terr.lower())); want[e] -= 1; pick.append((e, name, terr, str(r[ix["Address"]]).strip()))
H = ["SI No", "User Name", "Chemist Name", "Territory", "Category", "Class", "Address", "City Name", "Contact person", "Mobile No", "EMail ID", "State"]
wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Chemist Upload"; ws.append(H)
for i, c in enumerate(ws[1]):
    c.font = Font(bold=True)
    if i < 4: c.fill = PatternFill("solid", fgColor="FFFF00")
for i, (e, name, terr, addr) in enumerate(pick, 1):
    cat = "Hospital Pharmacy" if "hospital" in (name + addr).lower() else "Retail Pharmacy"
    slug = "".join(ch for ch in name.lower() if ch.isalnum())[:18]
    ws.append([i, e, name, terr, cat, "ABC"[i % 3], addr, terr.title(), "Mr. Demo Contact", f"98470{10000 + i}", f"{slug}@chemist-demo.in", "Kerala"])
for col, w in zip("ABCDEFGHIJKL", [7, 11, 28, 18, 18, 7, 40, 18, 18, 13, 32, 10]): ws.column_dimensions[col].width = w
wb.save(out); print(len(pick), "rows")
