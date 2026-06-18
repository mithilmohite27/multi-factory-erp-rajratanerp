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
  "Customer_Payments",
  "Stock_Thresholds",
];

const FACTORIES = [
  { id: "factory-1", name: "Kalot Factory 1" },
  { id: "factory-2", name: "Kalot Factory 2" },
  { id: "factory-3", name: "Kalot Factory 3" },
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

function periodStart(period) {
  const today = indiaDateKey();
  if (period === "month") return `${today.slice(0, 7)}-01`;
  if (period === "week") {
    const date = new Date(`${today}T12:00:00+05:30`);
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - day + 1);
    return indiaDateKey(date);
  }
  return today;
}

function rowsForPeriod(rows, period, field = "Date") {
  const start = periodStart(period);
  const end = indiaDateKey();
  return rows.filter((row) => {
    const key = rowDateKey(row[field]);
    return key && key >= start && key <= end;
  });
}

function statusValue(row) {
  return String(row.Status || "").trim().toLowerCase();
}

function isOpenOrder(row) {
  return !["dispatched", "completed", "complete", "closed", "cancelled"].includes(
    statusValue(row),
  );
}

function parseColorMix(value) {
  const parts = String(value || "").split("+");
  const mix = parts.map((part) => {
    const match = part.trim().match(/^(.+?):\s*([0-9]+(?:\.[0-9]+)?)\s*brass$/i);
    return match ? { color: match[1].trim(), blocks: Math.round(numberValue(match[2]) * 285) } : null;
  });
  return mix.length >= 2 && mix.every(Boolean) ? mix : [];
}

function filterRowsByFactory(rows, factoryId) {
  if (!factoryId || factoryId === "all") return rows;
  return rows.filter((row) => {
    const value = row.Factory_ID || row.factoryId || row.FactoryId || "";
    return value === factoryId;
  });
}

export function filterDataByFactory(data, factoryId) {
  return Object.fromEntries(
    Object.entries(data).map(([sheetName, rows]) => [
      sheetName,
      filterRowsByFactory(rows || [], factoryId),
    ]),
  );
}

function filterDataByExactFactory(data, factoryId) {
  return Object.fromEntries(
    Object.entries(data).map(([sheetName, rows]) => [
      sheetName,
      (rows || []).filter(
        (row) => (row.Factory_ID || row.factoryId || row.FactoryId || "") === factoryId,
      ),
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

function stockForThreshold(data, threshold) {
  const matches = (row) =>
    row.Factory_ID === threshold.Factory_ID &&
    row.Product_Size === threshold.Product_Size &&
    row.Color === threshold.Color;
  const opening = data.Opening_Stock.filter(matches).reduce((total, row) => {
    const blocks = numberValue(row.Blocks ?? row.Quantity);
    return String(row.Adjustment_Type).trim().toLowerCase() === "remove"
      ? total - Math.abs(blocks)
      : total + blocks;
  }, 0);
  const produced = data.Production_Variants.filter(matches).reduce(
    (total, row) => total + numberValue(row.Blocks),
    0,
  );
  const dispatched = data.Dispatch_Log.filter(matches).reduce(
    (total, row) => total + numberValue(row.Dispatch_Blocks),
    0,
  );
  const rejected = data.QC_Log.filter(matches).reduce(
    (total, row) => total + numberValue(row.Broken_Blocks),
    0,
  );
  const incompleteHistory = [...data.Dispatch_Log, ...data.QC_Log].some(
    (row) =>
      row.Factory_ID === threshold.Factory_ID &&
      row.Color === threshold.Color &&
      !row.Product_Size,
  );
  return {
    currentBlocks: opening + produced - dispatched - rejected,
    incompleteHistory,
  };
}

function dispatchTotalsByOrder(dispatchRows) {
  return dispatchRows.reduce((totals, row) => {
    const id = row.CRM_Order_ID;
    if (!id) return totals;
    totals[id] = numberValue(totals[id]) + numberValue(row.Dispatch_Blocks ?? row.Blocks);
    return totals;
  }, {});
}

function buildPendingColors(orders, dispatchRows) {
  const result = {};
  orders.filter(isOpenOrder).forEach((order) => {
    const orderDispatches = dispatchRows.filter(
      (row) => row.CRM_Order_ID === order.CRM_Order_ID,
    );
    const mix = parseColorMix(order.Color);
    if (mix.length) {
      mix.forEach((item) => {
        const dispatched = orderDispatches
          .filter((row) => row.Color === item.color)
          .reduce((total, row) => total + numberValue(row.Dispatch_Blocks), 0);
        result[item.color] = numberValue(result[item.color]) + Math.max(0, item.blocks - dispatched);
      });
      return;
    }
    const dispatched = orderDispatches.reduce(
      (total, row) => total + numberValue(row.Dispatch_Blocks),
      0,
    );
    const color = String(order.Color || "Unspecified").includes("+")
      ? "Custom mix"
      : String(order.Color || "Unspecified");
    result[color] = numberValue(result[color]) + Math.max(0, numberValue(order.Order_Blocks) - dispatched);
  });
  return Object.entries(result)
    .filter(([, blocks]) => blocks > 0)
    .map(([color, blocks]) => ({ color, blocks }))
    .sort((a, b) => b.blocks - a.blocks);
}

export function buildDashboard(data, period = "today") {
  const productionPeriod = rowsForPeriod(data.Production_Log, period);
  const dispatchPeriod = rowsForPeriod(data.Dispatch_Log, period);
  const qcPeriod = rowsForPeriod(data.QC_Log, period);
  const cashPeriod = rowsForPeriod(data.CashFlow_Log, period);
  const crmPeriod = rowsForPeriod(data.CRM_Log, period);
  const activityPeriod = rowsForPeriod(data.Activity_Log, period, "Timestamp");
  const pendingOrders = data.CRM_Log.filter(isOpenOrder);
  const dispatchedByOrder = dispatchTotalsByOrder(data.Dispatch_Log);
  const cashBalance = data.CashFlow_Log.reduce((balance, row) => {
    const type = String(row.Type).trim().toLowerCase();
    const amount = numberValue(row.Amount);
    return ["receipt", "income", "in", "credit"].includes(type)
      ? balance + amount
      : balance - amount;
  }, 0);
  const periodRevenue = sum(dispatchPeriod, "Revenue");
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
  const qcLoss = qcPeriod.reduce(
    (total, row) => total + numberValue(row.QC_Loss ?? row.Loss_Value),
    0,
  );
  const productionCost = productionPeriod.reduce(
    (total, row) => total + numberValue(row.Total_Daily_Cost),
    0,
  );
  const freightCost = dispatchPeriod.reduce(
    (total, row) => total + numberValue(row.Freight_Amount),
    0,
  );

  const expenses = cashPeriod
    .filter((row) => ["out", "expense", "debit", "payment"].includes(String(row.Type).trim().toLowerCase()))
    .reduce((total, row) => total + numberValue(row.Amount), 0);
  const pendingDispatchBlocks = pendingOrders.reduce(
    (total, order) => total + Math.max(0, numberValue(order.Order_Blocks) - numberValue(dispatchedByOrder[order.CRM_Order_ID])),
    0,
  );
  const partialOrders = pendingOrders.filter((order) =>
    statusValue(order) === "partial" || numberValue(dispatchedByOrder[order.CRM_Order_ID]) > 0,
  ).length;
  const completedOrders = crmPeriod.filter((order) => !isOpenOrder(order)).length;
  const customOrders = crmPeriod.filter((order) => String(order.Color || "").includes("+")).length;
  const incompleteProduction = productionPeriod.filter(
    (row) => !row.Product_Size || numberValue(row.Total_Blocks) <= 0,
  ).length;
  const productProduction = ["40mm", "60mm", "80mm"].map((size) => ({
    size,
    blocks: productionPeriod
      .filter((row) => String(row.Product_Size).trim().toLowerCase() === size.toLowerCase())
      .reduce((total, row) => total + numberValue(row.Total_Blocks), 0),
  }));
  const payrollDue = labourEarned - payrollAdvances;
  const pendingPayments = Math.max(0, vendorInvoices - vendorPayments);
  const customerPayments = sum(data.Customer_Payments, "Amount");
  const customerReceivables = Math.max(0, sum(data.CRM_Log, "Order_Value") - customerPayments);
  const urgentOrders = pendingOrders.filter((order) => {
    const priority = String(order.Priority || "").trim().toLowerCase();
    const dueDate = rowDateKey(order.Due_Date);
    return ["high", "urgent"].includes(priority) || (dueDate && dueDate < indiaDateKey());
  });
  const thresholdResults = data.Stock_Thresholds.map((threshold) => ({
    factoryId: threshold.Factory_ID,
    productSize: threshold.Product_Size,
    color: threshold.Color,
    minimumBlocks: numberValue(threshold.Minimum_Blocks),
    ...stockForThreshold(data, threshold),
  }));
  const incompleteStockThresholds = thresholdResults.filter(
    (item) => item.incompleteHistory,
  );
  const lowStockItems = thresholdResults.filter(
    (item) => !item.incompleteHistory && item.currentBlocks <= item.minimumBlocks,
  );
  const unassignedRows = Object.entries(data).reduce((total, [sheetName, rows]) => {
    if (["Stock_Thresholds"].includes(sheetName)) return total;
    return total + rows.filter((row) => !row.Factory_ID && !row.factoryId && !row.FactoryId).length;
  }, 0);

  const alerts = [];
  if (pendingDispatchBlocks > 0) alerts.push({ type: "warning", title: "Pending dispatch", detail: `${pendingDispatchBlocks} blocks remain against active orders.` });
  if (pendingPayments > 0) alerts.push({ type: "finance", title: "Vendor payments pending", detail: `Vendor payable is ${pendingPayments}.` });
  if (payrollDue > 0) alerts.push({ type: "payroll", title: "Payroll due", detail: `Current payroll due is ${payrollDue}.` });
  if (incompleteProduction > 0) alerts.push({ type: "danger", title: "Incomplete production entry", detail: `${incompleteProduction} production entries need review.` });
  if (urgentOrders.length > 0) alerts.push({ type: "danger", title: "Urgent orders", detail: `${urgentOrders.length} active orders are high priority or overdue.` });
  lowStockItems.slice(0, 5).forEach((item) => alerts.push({ type: "stock", title: `Low stock: ${item.productSize} ${item.color}`, detail: `${item.currentBlocks} blocks available; minimum is ${item.minimumBlocks}.` }));
  if (incompleteStockThresholds.length > 0) alerts.push({ type: "data", title: "Stock alerts need historical size mapping", detail: `${incompleteStockThresholds.length} thresholds are withheld because older Dispatch/QC rows have no Product_Size.` });
  if (unassignedRows > 0) alerts.push({ type: "data", title: "Historical records need factory assignment", detail: `${unassignedRows} rows have no Factory_ID and remain only in consolidated totals.` });

  return {
    generatedAt: new Date().toISOString(),
    period,
    cards: {
      todaysProduction: sum(productionPeriod, "Total_Blocks"),
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
      todaysDispatch: dispatchPeriod.reduce((total, row) => total + numberValue(row.Dispatch_Blocks ?? row.Blocks), 0),
      pendingOrders: pendingOrders.length,
      pendingPayments,
      customerReceivables,
      todaysExpenses: expenses,
      cashBalance,
      netProfit: periodRevenue - productionCost - freightCost - qcLoss,
      qcLoss,
      payrollDue,
      lowStockAlerts:
        data.Stock_Thresholds.length && incompleteStockThresholds.length === 0
          ? lowStockItems.length
          : null,
    },
    productProduction,
    crmInsight: {
      activeOrders: pendingOrders.length,
      pendingOrders: pendingOrders.filter((row) => statusValue(row) !== "partial").length,
      completedOrders,
      customOrders,
      urgentOrders: urgentOrders.length,
    },
    dispatchInsight: {
      dispatchedBlocks: dispatchPeriod.reduce((total, row) => total + numberValue(row.Dispatch_Blocks ?? row.Blocks), 0),
      pendingBlocks: pendingDispatchBlocks,
      partialOrders,
      pendingByColor: buildPendingColors(data.CRM_Log, data.Dispatch_Log),
    },
    alerts,
    availability: {
      customerReceivables: true,
      urgentOrders: true,
      lowStockThresholds:
        data.Stock_Thresholds.length > 0 && incompleteStockThresholds.length === 0,
    },
    dataQuality: {
      unassignedRows,
      incompleteStockThresholds: incompleteStockThresholds.length,
    },
    recentActivity: [...activityPeriod]
      .sort(
        (a, b) =>
          new Date(b.Timestamp || 0).getTime() -
          new Date(a.Timestamp || 0).getTime(),
      )
      .slice(0, 8),
  };
}

function buildFactoryBreakdown(data, period) {
  return FACTORIES.map((factory) => {
    const factoryData = filterDataByExactFactory(data, factory.id);
    return {
      ...factory,
      cards: buildDashboard(factoryData, period).cards,
      hasDailyEntry: factoryData.Production_Log.some((row) => isToday(row.Date)),
    };
  });
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
    const user = await requireAdmin(req);
    const requestedFactoryId = req.query?.factoryId || "all";
    const superAdmin = String(user.role || "").trim().toLowerCase() === "super admin";
    const assignedFactories = Array.isArray(user.factoryIds) ? user.factoryIds : [];
    if (!superAdmin && assignedFactories.length === 0) {
      const accessError = new Error("No factory is assigned to this user.");
      accessError.statusCode = 403;
      throw accessError;
    }
    const factoryId = superAdmin
      ? requestedFactoryId
      : assignedFactories.includes(requestedFactoryId)
        ? requestedFactoryId
        : assignedFactories[0];
    const period = ["today", "week", "month"].includes(req.query?.period)
      ? req.query.period
      : "today";
    const cacheKey = `${factoryId}:${period}`;
    const cached = dashboardCache.get(cacheKey);

    if (cached && Date.now() - cached.createdAt < DASHBOARD_CACHE_TTL_MS) {
      res.status(200).json({ ok: true, dashboard: cached.dashboard });
      return;
    }

    const dashboardData = await readDashboardSheets();
    const dashboard = buildDashboard(filterDataByFactory(dashboardData, factoryId), period);
    if (factoryId === "all") {
      dashboard.factoryBreakdown = buildFactoryBreakdown(dashboardData, period);
      dashboard.factoryBreakdown
        .filter((factory) => !factory.hasDailyEntry)
        .forEach((factory) => dashboard.alerts.push({
          type: "factory",
          title: `${factory.name}: no daily production entry`,
          detail: "No production entry has been recorded for today.",
        }));
    }
    dashboardCache.set(cacheKey, { dashboard, createdAt: Date.now() });
    res.status(200).json({
      ok: true,
      dashboard,
    });
  } catch (error) {
    sendError(res, error);
  }
}
