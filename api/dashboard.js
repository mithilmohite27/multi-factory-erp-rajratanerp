import { requireAdmin } from "./_lib/auth.js";
import { allowMethods, sendError } from "./_lib/http.js";
import * as sheetsService from "./_lib/sheetsService.js";

const DASHBOARD_SHEETS = [
  "Opening_Stock",
  "Production_Log",
  "Production_Variants",
  "CRM_Log",
  "Dispatch_Log",
  "QC_Log",
  "Vendor_Ledger",
  "Payroll_Log",
  "CashFlow_Log",
  "Activity_Log",
];

const FACTORIES = [
  { id: "factory-1", name: "Factory 1" },
  { id: "factory-2", name: "Factory 2" },
  { id: "factory-3", name: "Factory 3" },
];
const DASHBOARD_CACHE_TTL_MS = 60 * 1000;
const dashboardCache = new Map();

const numberValue = (value) => {
  const normalized = String(value ?? "").replaceAll(",", "").trim();
  const result = Number(normalized);
  return Number.isFinite(result) ? result : 0;
};

function indiaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function rowDateKey(value) {
  if (!value) return "";
  const stringValue = String(value).trim();
  const directMatch = stringValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (directMatch) return directMatch.slice(1).join("-");
  const indiaMatch = stringValue.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (indiaMatch) {
    const [, day, month, year] = indiaMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : indiaDateKey(parsed);
}

const isToday = (value) => rowDateKey(value) === indiaDateKey();
const sum = (rows, field) =>
  rows.reduce((total, row) => total + numberValue(row[field]), 0);

function filterRowsByFactory(rows, factoryId) {
  if (!factoryId || factoryId === "all") return rows;
  return rows.filter((row) => {
    const value = row.Factory_ID || row.factoryId || row.FactoryId || "";
    return !value || value === factoryId;
  });
}

function filterDataByFactory(data, factoryId) {
  return Object.fromEntries(
    Object.entries(data).map(([sheetName, rows]) => [
      sheetName,
      filterRowsByFactory(rows || [], factoryId),
    ]),
  );
}

function openingStockTotal(rows) {
  return rows.reduce((total, row) => {
    const blocks = numberValue(row.Blocks ?? row.Quantity);
    return String(row.Adjustment_Type).trim().toLowerCase() === "remove"
      ? total - Math.abs(blocks)
      : total + blocks;
  }, 0);
}

function buildDashboard(data) {
  const productionToday = data.Production_Log.filter((row) =>
    isToday(row.Date),
  );
  const dispatchToday = data.Dispatch_Log.filter((row) => isToday(row.Date));
  const qcToday = data.QC_Log.filter((row) => isToday(row.Date));
  const pendingOrders = data.CRM_Log.filter((row) =>
    ["order", "partial", "pending", "open", "follow-up", "follow up", "quoted"].includes(
      String(row.Status).trim().toLowerCase(),
    ),
  ).length;
  const cashBalance = data.CashFlow_Log.reduce((balance, row) => {
    const type = String(row.Type).trim().toLowerCase();
    const amount = numberValue(row.Amount);
    return ["receipt", "income", "in", "credit"].includes(type)
      ? balance + amount
      : balance - amount;
  }, 0);
  const totalRevenue = sum(data.Dispatch_Log, "Revenue");
  const vendorInvoices = data.Vendor_Ledger.filter(
    (row) =>
      String(row.Type).trim().toLowerCase() === "invoice",
  ).reduce((total, row) => total + numberValue(row.Amount ?? row.Debit), 0);
  const vendorPayments = data.Vendor_Ledger.filter(
    (row) =>
      String(row.Type).trim().toLowerCase() === "payment",
  ).reduce((total, row) => total + numberValue(row.Amount ?? row.Credit), 0);
  const labourEarned = sum(data.Production_Log, "Labour_Cost");
  const payrollAdvances = data.Payroll_Log.filter(
    (row) =>
      String(row.Entry_Type || row.Type).trim().toLowerCase() === "advance",
  ).reduce((total, row) => total + numberValue(row.Amount), 0);
  const qcLoss = data.QC_Log.reduce(
    (total, row) => total + numberValue(row.QC_Loss ?? row.Loss_Value),
    0,
  );
  const productionCost = data.Production_Log.reduce(
    (total, row) => total + numberValue(row.Total_Daily_Cost),
    0,
  );
  const freightCost = data.Dispatch_Log.reduce(
    (total, row) => total + numberValue(row.Freight_Amount),
    0,
  );

  return {
    generatedAt: new Date().toISOString(),
    cards: {
      todaysProduction: sum(productionToday, "Total_Blocks"),
      currentStock:
        openingStockTotal(data.Opening_Stock) +
        sum(data.Production_Variants, "Blocks") -
        data.Dispatch_Log.reduce(
          (total, row) =>
            total + numberValue(row.Dispatch_Blocks ?? row.Blocks),
          0,
        ) -
        data.QC_Log.reduce(
          (total, row) =>
            total + numberValue(row.Broken_Blocks ?? row.Broken_Quantity),
          0,
        ),
      todaysRevenue: sum(dispatchToday, "Revenue"),
      pendingOrders,
      vendorOutstanding: vendorInvoices - vendorPayments,
      cashBalance,
      netProfit: totalRevenue - productionCost - freightCost - qcLoss,
      qcLoss: qcToday.reduce(
        (total, row) => total + numberValue(row.QC_Loss ?? row.Loss_Value),
        0,
      ),
      payrollDue: labourEarned - payrollAdvances,
    },
    recentActivity: [...data.Activity_Log]
      .sort(
        (a, b) =>
          new Date(b.Timestamp || 0).getTime() -
          new Date(a.Timestamp || 0).getTime(),
      )
      .slice(0, 8),
  };
}

function buildFactoryBreakdown(data) {
  return FACTORIES.map((factory) => ({
    ...factory,
    cards: buildDashboard(filterDataByFactory(data, factory.id)).cards,
  }));
}

async function readDashboardSheets() {
  if (typeof sheetsService.readSheetRowsBatch === "function") {
    return sheetsService.readSheetRowsBatch(DASHBOARD_SHEETS);
  }

  const entries = await Promise.all(
    DASHBOARD_SHEETS.map(async (sheetName) => [
      sheetName,
      await sheetsService.readSheetRows(sheetName),
    ]),
  );
  return Object.fromEntries(entries);
}

export default async function handler(req, res) {
  try {
    allowMethods(req, ["GET"]);
    await requireAdmin(req);
    const factoryId = req.query?.factoryId || "all";
    const cached = dashboardCache.get(factoryId);

    if (cached && Date.now() - cached.createdAt < DASHBOARD_CACHE_TTL_MS) {
      res.status(200).json({ ok: true, dashboard: cached.dashboard });
      return;
    }

    const dashboardData = await readDashboardSheets();
    const dashboard = buildDashboard(filterDataByFactory(dashboardData, factoryId));
    if (factoryId === "all") {
      dashboard.factoryBreakdown = buildFactoryBreakdown(dashboardData);
    }
    dashboardCache.set(factoryId, { dashboard, createdAt: Date.now() });
    res.status(200).json({
      ok: true,
      dashboard,
    });
  } catch (error) {
    sendError(res, error);
  }
}
