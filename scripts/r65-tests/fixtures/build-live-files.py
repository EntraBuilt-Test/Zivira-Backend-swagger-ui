# Round 65 -- rebuilds the READY test files so every employee reference is one of the LIVE Field Force codes (usage: build-live-files.py <backend scripts dir> <out dir>).
# Source rows are the earlier READY files (r61 / r62 / r63 fixtures); only the employee columns change. Never uses Tes_57.
import sys, os, openpyxl
from openpyxl.styles import PatternFill, Font
S, O = sys.argv[1], sys.argv[2]
LIVE = {"MR-001": "Rahul Deshmukh", "MR-002": "Anjali Menon", "MR-003": "Karthik Subramaniam", "MR-004": "Manoj Pillai", "MR-005": "Farhan Sheikh", "SR-MR-001": "Deepa Iyer"}
REPS = list(LIVE)
def load(path):
    ws = openpyxl.load_workbook(path).active; r = [list(x) for x in ws.iter_rows(values_only=True)]
    return ws.title, r[0], [x for x in r[1:] if any(v not in (None, "") for v in x)]
def mapper():
    m = {}
    def f(old):
        if old not in m: m[old] = REPS[len(m) % len(REPS)]
        return m[old]
    return f
def save(fn, sheet, headers, mandatory, rows):
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = sheet; ws.append(headers)
    for c in ws[1]:
        c.font = Font(bold=True)
        if c.value in mandatory: c.fill = PatternFill("solid", fgColor="FFFF00")
        ws.column_dimensions[c.column_letter].width = max(14, len(str(c.value)) + 4)
    for r in rows: ws.append(r)
    wb.save(f"{O}/{fn}"); print(fn, len(rows), "rows")
def remap(src, fn, col, mandatory, name_col=None, fixed=None, blank=()):
    sheet, h, rows = load(f"{S}/{src}"); f = mapper(); i = h.index(col)
    for r in rows:
        r[i] = fixed[rows.index(r)] if fixed else f(r[i])
        if name_col: r[h.index(name_col)] = LIVE[r[i]]
        for b in blank: r[h.index(b)] = None
    save(fn, sheet, h, mandatory, rows)
mand = lambda src: [c.value for c in openpyxl.load_workbook(f"{S}/{src}").active[1] if c.fill and c.fill.fgColor and c.fill.fgColor.rgb in ("00FFFF00", "FFFFFF00")]
T = lambda d, n: f"{d}-tests/fixtures/{n}"
# 02 / 03 / 07 unchanged (no employee codes)
for src, fn in [("r63/Product", "02_Product"), ("r63/Product_Rate", "03_Product_Rate"), ("r63/Holiday", "07_Holiday")]:
    d, n = src.split("/"); sheet, h, rows = load(f"{S}/{T(d, n + '_READY_TO_UPLOAD.xlsx')}"); save(f"{fn}_READY_TO_UPLOAD.xlsx", sheet, h, mand(T(d, n + "_READY_TO_UPLOAD.xlsx")), rows)
P = lambda d, n: T(d, n + "_READY_TO_UPLOAD.xlsx")
remap(P("r63", "Stockist"), "04_Stockist_READY_TO_UPLOAD.xlsx", "Emp Code", mand(P("r63", "Stockist")), name_col="Fieldforce Name", blank=("HQ Code",))
# 05 Listed Doctor: 10 rows, two doctors per rep for MR-001..MR-004... explicit so every rep is used
remap(P("r61", "Listed_Doctor_Upload"), "05_Listed_Doctor_READY_TO_UPLOAD.xlsx", "User Name", mand(P("r61", "Listed_Doctor_Upload")), fixed=["MR-001", "MR-001", "MR-002", "MR-002", "MR-003", "MR-003", "MR-004", "MR-005", "MR-005", "SR-MR-001"])
remap(P("r62", "Chemist_Upload"), "06_Chemists_READY_TO_UPLOAD.xlsx", "User Name", mand(P("r62", "Chemist_Upload")), fixed=["MR-001", "MR-001", "MR-002", "MR-002", "MR-003", "MR-003", "MR-004", "MR-005", "MR-005", "SR-MR-001"])
remap(P("r63", "Leave"), "08_Leave_READY_TO_UPLOAD.xlsx", "Employee Code", mand(P("r63", "Leave")), fixed=["MR-001", "MR-002", "MR-003", "MR-004", "MR-005", "SR-MR-001", "MR-001", "MR-002", "MR-003", "MR-004"])
remap(P("r63", "Target"), "09_Target_READY_TO_UPLOAD.xlsx", "HQ Code", mand(P("r63", "Target")))
remap(P("r63", "Sample_Despatch"), "10_Sample_Despatch_READY_TO_UPLOAD.xlsx", "Employee ID", mand(P("r63", "Sample_Despatch")))
remap(P("r63", "Input_Despatch"), "11_Input_Despatch_READY_TO_UPLOAD.xlsx", "Employee ID", mand(P("r63", "Input_Despatch")))
# 01 Salesforce (OPTIONAL): 6 clearly-demo reps that cannot collide with any live code; managers resolve by the LIVE manager codes
H = ["Employee Code", "Name", "Designation", "HQ", "State", "DOJ", "Reporting Manager Code", "Reporting Manager Name", "Reporting Manager II Name", "Mobile", "Email", "Division", "SubDivision"]
D = [("DEMO-MR-001", "Demo Rep One", "BANGALORE", "Karnataka", "ABM-001", "Vikram Shah"), ("DEMO-MR-002", "Demo Rep Two", "MYSORE", "Karnataka", "ABM-001", "Vikram Shah"), ("DEMO-MR-003", "Demo Rep Three", "CHENNAI", "Tamil Nadu", "ABM-002", "Priya Nair"),
     ("DEMO-MR-004", "Demo Rep Four", "COIMBATORE", "Tamil Nadu", "ABM-002", "Priya Nair"), ("DEMO-MR-005", "Demo Rep Five", "ERNAKULAM", "Kerala", "ABM-001", "Vikram Shah"), ("DEMO-MR-006", "Demo Rep Six", "CALICUT", "Kerala", "ABM-002", "Priya Nair")]
save("01_Salesforce_OPTIONAL_READY_TO_UPLOAD.xlsx", "UPL_SalesForce", H, ["Employee Code", "Name", "Designation", "HQ"],
     [[c, n, "BE", hq, st, "01/07/2026", mc, mn, None, f"90000000{i+1:02d}", f"demo-mr-00{i+1}@ziviralabs.com", "Zivira Labs Pvt Ltd", None] for i, (c, n, hq, st, mc, mn) in enumerate(D)])
