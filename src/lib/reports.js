import { BLOCK_COLORS, MATERIALS } from "./constants.js";
import { calculateProfitLoss } from "./formulas.js";
import { normalizeText, numberValue } from "./pageUtils.js";

export const REPORT_SHEETS = Object.freeze([
  "Opening_Stock",
  "Opening_Material_Stock",
  "Production_Log",
  "Production_Variants",
  "CRM_Log",
  "Dispatch_Log",
  "QC_Log",
  "Vendor_Ledger",
  "Payroll_Log",
  "CashFlow_Log",
  "External_Material_Usage",
]);

const MATERIAL_USAGE_FIELDS = Object.freeze({
  "Cement bags": "Total_Cement",
  "Greet tons": "Greet_Tons",
  "Powder tons": "Powder_Tons",
  "Chemical litres": "Chemical_Litres",
  "Yellow kg": "Yellow_Kg",
  "Red kg": "Red_Kg",
  "Black kg": "Black_Kg",
  "Reti ghamela": "Reti_Ghamela",
  "Plastic ml": "Plastic_Ml",
});

function sumForColor(rows, color, fields) {
  return rows.reduce((total, row) => {
    const rowColor = row.Color || row.Variant || row.Variant_Name;
    if (normalizeText(rowColor) !== normalizeText(color)) return total;
    const field = fields.find((name) => row[name] !== undefined);
    return total + numberValue(field ? row[field] : 0);
  }, 0);
}

function openingForColor(rows, color) {
  return rows.reduce((total, row) => {
    if (normalizeText(row.Color || row.Variant) !== normalizeText(color)) {
      return total;
    }
    const blocks = numberValue(row.Blocks ?? row.Quantity);
    return normalizeText(row.Adjustment_Type) === "remove"
      ? total - Math.abs(blocks)
      : total + blocks;
  }, 0);
}

function materialQuantity(rows, materialName) {
  return rows.reduce((total, row) => {
    if (normalizeText(row.Material) !== normalizeText(materialName)) return total;
    return total + numberValue(row.Quantity);
  }, 0);
}

const definitions = {
  "Production Report": {
    columns: [
      ["Date", "Date"],
      ["Total_Blocks", "Blocks"],
      ["Brass", "Brass"],
      ["Total_Daily_Cost", "Final Cost"],
      ["Cost_Per_Block", "Cost / Block"],
      ["Notes", "Notes"],
    ],
    rows: (data) => data.Production_Log,
  },
  "Finished Stock Report": {
    columns: [
      ["Color", "Color"],
      ["Opening", "Opening"],
      ["Produced", "Produced"],
      ["Dispatched", "Dispatched"],
      ["Broken", "Broken"],
      ["Current_Stock", "Current Stock"],
    ],
    rows: (data) =>
      BLOCK_COLORS.map((color) => {
        const opening = openingForColor(data.Opening_Stock, color);
        const produced = sumForColor(data.Production_Variants, color, ["Blocks"]);
        const dispatched = sumForColor(data.Dispatch_Log, color, [
          "Dispatch_Blocks",
          "Blocks",
        ]);
        const broken = sumForColor(data.QC_Log, color, [
          "Broken_Blocks",
          "Broken_Quantity",
        ]);
        return {
          Color: color,
          Opening: opening,
          Produced: produced,
          Dispatched: dispatched,
          Broken: broken,
          Current_Stock: opening + produced - dispatched - broken,
        };
      }),
  },
  "Material Stock Report": {
    columns: [
      ["Material", "Material"],
      ["Unit", "Unit"],
      ["Opening", "Opening"],
      ["Purchases", "Purchases"],
      ["Production_Use", "Production Use"],
      ["External_Use", "External Use"],
      ["Current_Stock", "Current Stock"],
    ],
    rows: (data) =>
      MATERIALS.map((material) => {
        const opening = materialQuantity(
          data.Opening_Material_Stock,
          material.name,
        );
        const purchases = data.Vendor_Ledger
          .filter(
            (row) =>
              normalizeText(row.Type) === "invoice" &&
              normalizeText(row.Material) === normalizeText(material.name),
          )
          .reduce((total, row) => total + numberValue(row.Quantity), 0);
        const productionUse = data.Production_Log.reduce(
          (total, row) =>
            total + numberValue(row[MATERIAL_USAGE_FIELDS[material.name]]),
          0,
        );
        const externalUse = materialQuantity(
          data.External_Material_Usage,
          material.name,
        );
        return {
          Material: material.name,
          Unit: material.unit,
          Opening: opening,
          Purchases: purchases,
          Production_Use: productionUse,
          External_Use: externalUse,
          Current_Stock:
            opening + purchases - productionUse - externalUse,
        };
      }),
  },
  "CRM Report": {
    columns: [
      ["Date", "Date"],
      ["Client_Name", "Client"],
      ["Location", "Location"],
      ["Color", "Color"],
      ["Order_Brass", "Order Brass"],
      ["Order_Blocks", "Order Blocks"],
      ["Order_Value", "Order Value"],
      ["Status", "Status"],
    ],
    rows: (data) => data.CRM_Log,
  },
  "Dispatch Report": {
    columns: [
      ["Date", "Date"],
      ["Client_Name", "Client"],
      ["Color", "Color"],
      ["Dispatch_Brass", "Brass"],
      ["Dispatch_Blocks", "Blocks"],
      ["Transport_Type", "Transport"],
      ["Revenue", "Revenue"],
    ],
    rows: (data) => data.Dispatch_Log,
  },
  "QC Report": {
    columns: [
      ["Date", "Date"],
      ["Color", "Color"],
      ["Broken_Blocks", "Broken Blocks"],
      ["Reason", "Reason"],
      ["QC_Loss", "QC Loss"],
    ],
    rows: (data) => data.QC_Log,
  },
  "Vendor Report": {
    columns: [
      ["Date", "Date"],
      ["VendorName", "Vendor"],
      ["Type", "Type"],
      ["Material", "Material"],
      ["Quantity", "Quantity"],
      ["Unit", "Unit"],
      ["Amount", "Amount"],
    ],
    rows: (data) => data.Vendor_Ledger,
  },
  "Payroll Report": {
    columns: [
      ["Date", "Date"],
      ["Worker_Name", "Worker"],
      ["Entry_Type", "Type"],
      ["Amount", "Amount"],
      ["Notes", "Notes"],
    ],
    rows: (data) => data.Payroll_Log,
  },
  "Cash Flow Report": {
    columns: [
      ["Date", "Date"],
      ["Type", "Type"],
      ["Source", "Source"],
      ["Description", "Description"],
      ["Amount", "Amount"],
      ["Linked_Module", "Linked Module"],
    ],
    rows: (data) => data.CashFlow_Log,
  },
  "P&L Report": {
    columns: [
      ["Revenue", "Revenue"],
      ["Production_Material_Cost", "Production / Material Cost"],
      ["Labour_Cost", "Labour Cost"],
      ["Freight", "Freight"],
      ["QC_Loss", "QC Loss"],
      ["Total_Expenses", "Total Expenses"],
      ["Net_Profit", "Net Profit"],
      ["Profit_Margin", "Profit Margin %"],
      ["Cash_Position", "Cash Position"],
    ],
    rows: (data) => {
      const results = calculateProfitLoss(data);
      return [
        {
          Revenue: results.revenue,
          Production_Material_Cost: results.productionCost,
          Labour_Cost: results.labourCost,
          Freight: results.freight,
          QC_Loss: results.qcLoss,
          Total_Expenses: results.totalExpenses,
          Net_Profit: results.netProfit,
          Profit_Margin: results.profitMargin,
          Cash_Position: results.cashPosition,
        },
      ];
    },
  },
};

export function buildReport(reportName, data) {
  const definition = definitions[reportName] || definitions["Production Report"];
  return {
    columns: definition.columns,
    rows: definition.rows(data),
  };
}

export function filterSheetsByDate(data, startDate, endDate) {
  if (!startDate && !endDate) return data;

  const start = startDate ? new Date(`${startDate}T00:00:00`) : null;
  const end = endDate ? new Date(`${endDate}T23:59:59`) : null;

  return Object.fromEntries(
    Object.entries(data).map(([sheetName, rows]) => [
      sheetName,
      rows.filter((row) => {
        const value = row.Date || row.Month;
        if (!value) return true;
        const date = new Date(String(value).length === 7 ? `${value}-01` : value);
        if (Number.isNaN(date.getTime())) return false;
        return (!start || date >= start) && (!end || date <= end);
      }),
    ]),
  );
}

export function exportRowsToCsv(filename, columns, rows) {
  const escape = (value) => {
    const text = String(value ?? "");
    const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safeText.replaceAll('"', '""')}"`;
  };
  const content = [
    columns.map(([, label]) => escape(label)).join(","),
    ...rows.map((row) =>
      columns.map(([key]) => escape(row[key])).join(","),
    ),
  ].join("\r\n");
  const blob = new Blob([`\uFEFF${content}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
