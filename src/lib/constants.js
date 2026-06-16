export const MODULES = Object.freeze([
  { key: "dashboard", label: "Dashboard", path: "/", shortLabel: "DB" },
  {
    key: "production-log",
    label: "Production Log",
    path: "/production-log",
    shortLabel: "PL",
  },
  {
    key: "material-inventory",
    label: "Material Inventory",
    path: "/material-inventory",
    shortLabel: "MI",
  },
  {
    key: "finished-block-inventory",
    label: "Finished Block Inventory",
    path: "/finished-block-inventory",
    shortLabel: "FB",
  },
  { key: "crm", label: "CRM", path: "/crm", shortLabel: "CR" },
  { key: "dispatch", label: "Dispatch", path: "/dispatch", shortLabel: "DS" },
  { key: "qc", label: "QC", path: "/qc", shortLabel: "QC" },
  {
    key: "vendor-ledger",
    label: "Vendor Ledger",
    path: "/vendor-ledger",
    shortLabel: "VL",
  },
  { key: "payroll", label: "Payroll", path: "/payroll", shortLabel: "PR" },
  {
    key: "cash-register",
    label: "Cash Register",
    path: "/cash-register",
    shortLabel: "CA",
  },
  { key: "profit-loss", label: "P&L", path: "/profit-loss", shortLabel: "P&L" },
  {
    key: "bills-challans",
    label: "Bills & Challans",
    path: "/bills-challans",
    shortLabel: "BC",
  },
  {
    key: "reports-center",
    label: "Reports Center",
    path: "/reports-center",
    shortLabel: "RC",
  },
  { key: "settings", label: "Settings", path: "/settings", shortLabel: "ST" },
]);

export const BLOCK_COLORS = Object.freeze([
  "Red",
  "Yellow",
  "Black",
  "White",
  "Grey",
  "Custom",
]);

export const PRODUCT_SIZES = Object.freeze(["40mm", "60mm", "80mm"]);

export const MATERIALS = Object.freeze([
  { name: "Cement bags", unit: "bags" },
  { name: "Greet tons", unit: "tons" },
  { name: "Powder tons", unit: "tons" },
  { name: "Chemical litres", unit: "litres" },
  { name: "Yellow kg", unit: "kg" },
  { name: "Red kg", unit: "kg" },
  { name: "Black kg", unit: "kg" },
  { name: "Reti ghamela", unit: "ghamela" },
  { name: "Plastic ml", unit: "ml" },
]);

export const INVENTORY_SHEETS = Object.freeze([
  "Opening_Material_Stock",
  "Vendor_Ledger",
  "Production_Log",
  "External_Material_Usage",
  "Opening_Stock",
  "Production_Variants",
  "Dispatch_Log",
  "QC_Log",
]);

export const CRM_STATUSES = Object.freeze(["Order", "Partial", "Dispatched"]);

export const TRANSPORT_TYPES = Object.freeze([
  "Direct Client Pickup",
  "Company Transport",
]);

export const VENDOR_TYPES = Object.freeze(["Invoice", "Payment"]);

export const PAYROLL_TYPES = Object.freeze(["Advance", "Wage"]);

export const PAYMENT_SOURCES = Object.freeze([
  "Cash",
  "Bank",
  "UPI",
  "Other",
]);

export const CASH_TYPES = Object.freeze(["In", "Out"]);

export const CASH_SOURCES = Object.freeze(["Factory", "External"]);

export const DOCUMENT_TYPES = Object.freeze([
  "Tax Invoice",
  "Delivery Challan",
]);

export const REPORT_MODULES = Object.freeze([
  "Production Report",
  "Finished Stock Report",
  "Material Stock Report",
  "CRM Report",
  "Dispatch Report",
  "QC Report",
  "Vendor Report",
  "Payroll Report",
  "Cash Flow Report",
  "P&L Report",
]);
