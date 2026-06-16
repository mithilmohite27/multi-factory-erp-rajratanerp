import { useCallback, useEffect, useMemo, useState } from "react";
import { Message, PageHeader } from "../components/WorkflowUI";
import { calculateProfitLoss } from "../lib/formulas";
import { formatCurrency, formatNumber, todayInIndia } from "../lib/pageUtils";
import { syncFromSheets } from "../lib/sheets";
import { useAuth } from "../lib/authContext";

const SHEETS = [
  "Production_Log",
  "Dispatch_Log",
  "QC_Log",
  "Vendor_Ledger",
  "Payroll_Log",
  "CashFlow_Log",
];

const FILTERS = ["Today", "This Week", "This Month", "Custom Range"];

function startOfWeek(date) {
  const result = new Date(date);
  const day = result.getDay();
  result.setDate(result.getDate() - (day === 0 ? 6 : day - 1));
  result.setHours(0, 0, 0, 0);
  return result;
}

function getRange(filter, customStart, customEnd) {
  const today = new Date(`${todayInIndia()}T00:00:00`);
  if (filter === "Today") return [today, today];
  if (filter === "This Week") return [startOfWeek(today), today];
  if (filter === "This Month") {
    return [new Date(today.getFullYear(), today.getMonth(), 1), today];
  }
  return [
    customStart ? new Date(`${customStart}T00:00:00`) : null,
    customEnd ? new Date(`${customEnd}T23:59:59`) : null,
  ];
}

function rowDate(row) {
  const value = row.Date || row.Month;
  if (!value) return null;
  const parsed = new Date(String(value).length === 7 ? `${value}-01` : value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export default function ProfitLoss() {
  const { logout } = useAuth();
  const [data, setData] = useState(
    Object.fromEntries(SHEETS.map((sheetName) => [sheetName, []])),
  );
  const [filter, setFilter] = useState("This Month");
  const [customStart, setCustomStart] = useState(todayInIndia());
  const [customEnd, setCustomEnd] = useState(todayInIndia());
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await syncFromSheets(SHEETS));
      setStatus("ready");
    } catch (error) {
      if ([401, 403].includes(error.status)) logout();
      else {
        setMessage(error.message);
        setStatus("error");
      }
    }
  }, [logout]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredData = useMemo(() => {
    const [start, end] = getRange(filter, customStart, customEnd);
    return Object.fromEntries(
      Object.entries(data).map(([sheetName, rows]) => [
        sheetName,
        rows.filter((row) => {
          const date = rowDate(row);
          if (!date) return false;
          return (!start || date >= start) && (!end || date <= end);
        }),
      ]),
    );
  }, [data, filter, customStart, customEnd]);

  const results = useMemo(
    () => calculateProfitLoss(filteredData),
    [filteredData],
  );
  const expenseItems = [
    ["Production / material", results.productionCost],
    ["Labour", results.labourCost],
    ["Freight", results.freight],
    ["QC loss", results.qcLoss],
  ];
  const maxExpense = Math.max(...expenseItems.map(([, value]) => value), 1);
  const resultCards = [
    ["Revenue", results.revenue],
    ["Production / material cost", results.productionCost],
    ["Labour cost", results.labourCost],
    ["Freight", results.freight],
    ["QC loss", results.qcLoss],
    ["Total expenses", results.totalExpenses],
    ["Net profit", results.netProfit],
    ["Cash position", results.cashPosition],
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Financial performance"
        title="Profit & Loss"
        description="Final revenue, expense, profitability, and cash outcomes for the selected period."
      />
      <Message>{message}</Message>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`focus-ring rounded-xl px-4 py-2 text-sm font-semibold ${
                  filter === value
                    ? "bg-brand-700 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {value}
              </button>
            ))}
          </div>
          {filter === "Custom Range" && (
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="date"
                value={customStart}
                onChange={(event) => setCustomStart(event.target.value)}
                className="focus-ring rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={customEnd}
                onChange={(event) => setCustomEnd(event.target.value)}
                className="focus-ring rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
          )}
        </div>
        {status === "loading" && (
          <p className="mt-4 text-sm text-slate-500">Loading financial results...</p>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {resultCards.map(([label, value]) => (
          <article
            key={label}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel"
          >
            <p className="text-sm text-slate-500">{label}</p>
            <p
              className={`mt-2 text-xl font-black ${
                label === "Net profit" && value < 0
                  ? "text-red-600"
                  : "text-slate-900"
              }`}
            >
              {formatCurrency.format(value)}
            </p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel sm:p-6">
          <h2 className="text-lg font-bold text-slate-900">Expense profile</h2>
          <div className="mt-6 space-y-5">
            {expenseItems.map(([label, value]) => (
              <div key={label}>
                <div className="mb-2 flex justify-between gap-3 text-sm">
                  <span className="text-slate-500">{label}</span>
                  <strong className="text-slate-800">
                    {formatCurrency.format(value)}
                  </strong>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-brand-600"
                    style={{ width: `${Math.max(2, (value / maxExpense) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl bg-brand-900 p-6 text-white shadow-panel">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-sand-300">
            Final performance
          </p>
          <p className="mt-5 text-sm text-white/50">Profit margin</p>
          <p className="mt-1 text-4xl font-black">
            {formatNumber.format(results.profitMargin)}%
          </p>
          <p className="mt-6 text-sm text-white/50">Cost per block</p>
          <p className="mt-1 text-2xl font-black">
            {formatCurrency.format(results.costPerBlock)}
          </p>
        </article>
      </section>
    </div>
  );
}
