# Builds the READY_TO_UPLOAD files of the Round 62 upload tools from the real demo pack (usage: build-ready-files.py <demo dir> <out dir>).
# Layouts are the legacy template layouts (legacy sheet names, yellow mandatory headers), values are the demo pack's own rows.
import sys, datetime, openpyxl
from openpyxl.styles import PatternFill, Font
D, O = sys.argv[1], sys.argv[2]
def rows_of(name):
    ws = openpyxl.load_workbook(f"{D}/{name}.xlsx", read_only=True).active
    r = list(ws.iter_rows(values_only=True)); h = list(r[0]); return h, [dict(zip(h, x)) for x in r[1:] if any(v not in (None, "") for v in x)]
def save(fn, sheet, headers, mandatory, rows):
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = sheet; ws.append(headers)
    for c in ws[1]:
        c.font = Font(bold=True)
        if c.value in mandatory: c.fill = PatternFill("solid", fgColor="FFFF00")
        ws.column_dimensions[c.column_letter].width = max(14, len(str(c.value)) + 4)
    for r in rows: ws.append(r)
    wb.save(f"{O}/{fn}"); print(fn, len(rows), "rows")
# 3) Sample Despatch -- 10 real lines (Month/Year chosen on the page: Oct 2026)
_, r = rows_of("03_Customer_SampleDespatchUpload_DEMO_VALUES")
save("Sample_Despatch_READY_TO_UPLOAD.xlsx", "Upl_Despatch_Master", ["Employee ID", "Sample ERP Code", "Despatch Qty"], ["Employee ID", "Sample ERP Code", "Despatch Qty"], [[x["Employee Code"], x["Product Code"], x["Qty"]] for x in r[:10]])
# 4) Input Despatch
_, r = rows_of("04_Customer_InputDespatchUpload_DEMO_VALUES")
save("Input_Despatch_READY_TO_UPLOAD.xlsx", "Upl_Despatch_Master", ["Employee ID", "Input Code", "Despatch Qty"], ["Employee ID", "Input Code", "Despatch Qty"], [[x["Employee Code"], x["Input Item"], x["Qty"]] for x in r[:10]])
# 5) Target -- 10 real lines of Oct 2026 (Financial Year 2026 - 2027 chosen on the page)
_, r = rows_of("05_Customer_TargetUpload_DEMO_VALUES"); H = ["HQ Code", "Sale ERP Code", "Month", "Target Qty", "Target Rate", "Target Value"]
save("Target_READY_TO_UPLOAD.xlsx", "Upl_Target_Master", H, H, [[x["Employee Code"], x["Product Code"], x["Month"], x["Target Qty"], round(x["Target Value"] / x["Target Qty"], 2), x["Target Value"]] for x in r[:10]])
# 6) Salesforce -- all 71 real employees
h, r = rows_of("06_Upload_SalesforceUpload")
save("Salesforce_READY_TO_UPLOAD.xlsx", "UPL_SalesForce", h, ["Employee Code", "Name", "Designation", "HQ"], [[x[k] for k in h] for x in r])
# 7) Stockist -- all 73
h, r = rows_of("07_Upload_StockistUpload")
save("Stockist_READY_TO_UPLOAD.xlsx", "UPL_Stockist_Master", h, ["ERP Code", "Stockist Name", "State"], [[x[k] for k in h] for x in r])
# 8) Product -- all 28, in the template column order
_, r = rows_of("08_Upload_ProductUpload"); H = ["Product Code", "Product Name", "Group", "Category", "Brand", "Pack", "Division", "Active"]
save("Product_READY_TO_UPLOAD.xlsx", "UPL_Product_Master", H, ["Product Code", "Product Name"], [[x[k] for k in H] for x in r])
# 9) Product Rate -- all 28 (State Name chosen on the page)
h, r = rows_of("09_Upload_ProductRate_DEMO_VALUES")
save("Product_Rate_READY_TO_UPLOAD.xlsx", "UPL_Product_Rate", h, ["Product Code", "PTR", "Effective From"], [[x[k] for k in h] for x in r])
# 10) Holiday -- all 12, dates as YYYY-MM-DD text (the legacy note)
h, r = rows_of("11_Upload_HolidayFixationBulkUpload")
def iso(v): return v if not isinstance(v, str) or "-" in v[:5] else datetime.datetime.strptime(v, "%d/%m/%Y").strftime("%Y-%m-%d")
save("Holiday_READY_TO_UPLOAD.xlsx", "UPL_Holiday_Fixation", h, ["Date", "Holiday Name", "State"], [[iso(x["Date"]), x["Holiday Name"], x["State"], x["HQ"], x["Type"]] for x in r])
# 11) Leave -- 10 real lines (Financial Year 2026 chosen on the page)
h, r = rows_of("12_Upload_LeaveUpload_DEMO_VALUES")
save("Leave_READY_TO_UPLOAD.xlsx", "Leave_Upload", h, ["Employee Code", "Leave Type", "From Date", "To Date"], [[x[k] for k in h] for x in r[:10]])
