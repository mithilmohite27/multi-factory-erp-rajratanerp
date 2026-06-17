import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CLIENT_CONFIG } from "../lib/clientConfig";
import { refreshFactoryCalculations } from "../lib/sheets";
import { useAuth } from "../lib/authContext";
import {
  ALL_FACTORY_ID,
  canAccessModule,
  factoryLabel,
  isSuperAdmin,
  useFactory,
} from "../lib/factories";

const formatNumber = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const formatCurrency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const PERIODS = [
  { id: "today", label: "Today" },
  { id: "week", label: "This Week" },
  { id: "month", label: "This Month" },
];

const KPI_CARDS = [
  { key: "todaysProduction", label: "Production", code: "PR", format: "number", tone: "brand" },
  { key: "currentStock", label: "Finished Stock", code: "FS", format: "number", tone: "blue" },
  { key: "todaysDispatch", label: "Dispatch", code: "DS", format: "number", tone: "cyan" },
  { key: "pendingOrders", label: "Pending Orders", code: "PO", format: "number", tone: "amber" },
  { key: "pendingPayments", label: "Pending Payments", code: "PP", format: "currency", tone: "orange" },
  { key: "customerReceivables", label: "Customer Receivables", code: "AR", format: "currency", tone: "blue" },
  { key: "todaysExpenses", label: "Expenses", code: "EX", format: "currency", tone: "rose" },
  { key: "payrollDue", label: "Payroll Due", code: "PY", format: "currency", tone: "violet" },
  { key: "netProfit", label: "Net Profit / Loss", code: "NP", format: "currency", tone: "emerald" },
  { key: "lowStockAlerts", label: "Low Stock Alerts", code: "LS", format: "number", tone: "slate" },
  { key: "qcLoss", label: "QC / Rejection Loss", code: "QC", format: "currency", tone: "red" },
  { key: "cashBalance", label: "Cash Balance", code: "CB", format: "currency", tone: "slate" },
];

const TONES = {
  brand: "bg-brand-50 text-brand-700",
  blue: "bg-blue-50 text-blue-700",
  cyan: "bg-cyan-50 text-cyan-700",
  amber: "bg-amber-50 text-amber-700",
  orange: "bg-orange-50 text-orange-700",
  rose: "bg-rose-50 text-rose-700",
  violet: "bg-violet-50 text-violet-700",
  emerald: "bg-emerald-50 text-emerald-700",
  slate: "bg-slate-100 text-slate-600",
  red: "bg-red-50 text-red-700",
};

const quickActions = [
  { label: "Add production", path: "/production-log", code: "PL", module: "production-log" },
  { label: "New CRM order", path: "/crm", code: "CR", module: "crm" },
  { label: "Record dispatch", path: "/dispatch", code: "DS", module: "dispatch" },
  { label: "Cash entry", path: "/cash-register", code: "CA", module: "cash-register" },
];

function valueForCard(card, value) {
  if (value === null || value === undefined) return "Not configured";
  return card.format === "currency"
    ? formatCurrency.format(Number(value) || 0)
    : formatNumber.format(Number(value) || 0);
}

function SectionTitle({ eyebrow, title, detail }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">{eyebrow}</p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-lg font-black text-slate-900">{title}</h2>
        {detail && <p className="text-xs text-slate-500">{detail}</p>}
      </div>
    </div>
  );
}

function InsightStat({ label, value, unavailable = false }) {
  return (
    <div className="border-l-2 border-slate-200 py-1 pl-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-black ${unavailable ? "text-slate-400" : "text-slate-900"}`}>
        {unavailable ? "Not available" : formatNumber.format(Number(value) || 0)}
      </p>
    </div>
  );
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const {
    selectedFactoryId,
    setFactoryId,
    allFactories,
    canSeeAllFactories,
  } = useFactory();
  const [period, setPeriod] = useState("today");
  const [dashboard, setDashboard] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const result = await refreshFactoryCalculations(selectedFactoryId, {
        force: true,
        period,
      });
      setDashboard(result);
      setStatus("ready");
    } catch (requestError) {
      if ([401, 403].includes(requestError.status)) {
        logout();
        return;
      }
      setError(requestError.message);
      setStatus("error");
    }
  }, [logout, period, selectedFactoryId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const periodLabel = PERIODS.find((item) => item.id === period)?.label || "Today";
  const maxProductBlocks = Math.max(
    1,
    ...(dashboard?.productProduction || []).map((item) => Number(item.blocks) || 0),
  );
  const ownerView = isSuperAdmin(user);
  const actions = useMemo(
    () =>
      ownerView
        ? [
            { label: "Manage user access", path: "/settings", code: "UA" },
            { label: "Open reports center", path: "/reports-center", code: "RC" },
          ]
        : quickActions.filter((action) => canAccessModule(user, action.module)),
    [ownerView, user],
  );

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl bg-[#0b2821] text-white shadow-xl shadow-slate-900/10">
        <div className="grid gap-6 px-5 py-6 sm:px-7 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-300">Owner command center</p>
            <h1 className="mt-2 text-2xl font-black sm:text-3xl">{CLIENT_CONFIG.companyName}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
              Live operational view for production, orders, dispatch, finance, quality, and workforce.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-xs text-white/70">
              {dashboard?.generatedAt
                ? `Updated ${new Date(dashboard.generatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
                : "Loading live data"}
            </span>
            <button
              type="button"
              onClick={refresh}
              disabled={status === "loading"}
              className="focus-ring rounded-lg border border-white/15 bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/15 disabled:opacity-60"
            >
              {status === "loading" ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-white/10 bg-black/10 px-5 py-4 sm:px-7 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-white/45">Factory</span>
            {canSeeAllFactories ? (
              <select
                value={selectedFactoryId}
                onChange={(event) => setFactoryId(event.target.value)}
                className="focus-ring rounded-lg border border-white/15 bg-[#153a31] px-3 py-2 text-sm font-semibold text-white"
              >
                <option value={ALL_FACTORY_ID}>All Factories</option>
                {allFactories.map((factory) => (
                  <option key={factory.id} value={factory.id}>{factory.name}</option>
                ))}
              </select>
            ) : (
              <span className="rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold">
                {factoryLabel(selectedFactoryId)}
              </span>
            )}
          </div>
          <div className="flex w-full gap-1 rounded-xl bg-white/[0.06] p-1 sm:w-auto">
            {PERIODS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setPeriod(item.id)}
                className={`focus-ring flex-1 rounded-lg px-3 py-2 text-xs font-bold transition sm:flex-none ${
                  period === item.id ? "bg-white text-slate-900 shadow-sm" : "text-white/60 hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Live data could not be refreshed. {error}
        </div>
      )}

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <SectionTitle eyebrow="Business pulse" title={`${periodLabel} overview`} />
          <p className="hidden text-xs text-slate-500 sm:block">
            {selectedFactoryId === ALL_FACTORY_ID ? "Consolidated across all factories" : factoryLabel(selectedFactoryId)}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
          {KPI_CARDS.map((card) => (
            <article key={card.key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-panel">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-500">{card.label}</p>
                  <p className={`mt-2 truncate text-xl font-black ${card.key === "netProfit" && Number(dashboard?.cards?.[card.key]) < 0 ? "text-red-700" : "text-slate-950"}`}>
                    {dashboard ? valueForCard(card, dashboard.cards?.[card.key]) : "--"}
                  </p>
                </div>
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[10px] font-black ${TONES[card.tone]}`}>
                  {card.code}
                </span>
              </div>
              {card.key === "lowStockAlerts" && dashboard?.cards?.lowStockAlerts == null && (
                <p className="mt-2 text-[11px] text-slate-400">Thresholds required</p>
              )}
              {card.key === "pendingPayments" && (
                <p className="mt-2 text-[11px] text-slate-400">Vendor payables</p>
              )}
            </article>
          ))}
        </div>
      </section>

      {selectedFactoryId === ALL_FACTORY_ID && dashboard?.factoryBreakdown?.length > 0 && (
        <section>
          <SectionTitle eyebrow="Factory comparison" title="Performance by production unit" detail={periodLabel} />
          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            {dashboard.factoryBreakdown.map((factory) => (
              <article key={factory.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-black text-slate-900">{factory.name}</h3>
                    <p className="mt-1 text-xs text-slate-500">{factory.hasDailyEntry ? "Daily entry recorded" : "No production entry today"}</p>
                  </div>
                  <span className={`h-2.5 w-2.5 rounded-full ${factory.hasDailyEntry ? "bg-emerald-500" : "bg-amber-500"}`} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div><dt className="text-xs text-slate-500">Production</dt><dd className="mt-0.5 font-black">{formatNumber.format(factory.cards.todaysProduction || 0)}</dd></div>
                  <div><dt className="text-xs text-slate-500">Stock</dt><dd className="mt-0.5 font-black">{formatNumber.format(factory.cards.currentStock || 0)}</dd></div>
                  <div><dt className="text-xs text-slate-500">Dispatch</dt><dd className="mt-0.5 font-black">{formatNumber.format(factory.cards.todaysDispatch || 0)}</dd></div>
                  <div><dt className="text-xs text-slate-500">Pending orders</dt><dd className="mt-0.5 font-black">{formatNumber.format(factory.cards.pendingOrders || 0)}</dd></div>
                  <div><dt className="text-xs text-slate-500">Payables</dt><dd className="mt-0.5 font-black">{formatCurrency.format(factory.cards.pendingPayments || 0)}</dd></div>
                  <div><dt className="text-xs text-slate-500">Expenses</dt><dd className="mt-0.5 font-black">{formatCurrency.format(factory.cards.todaysExpenses || 0)}</dd></div>
                  <div className="col-span-2 border-t border-slate-200 pt-3"><dt className="text-xs text-slate-500">Net profit / loss</dt><dd className={`mt-0.5 font-black ${Number(factory.cards.netProfit) < 0 ? "text-red-700" : "text-emerald-700"}`}>{formatCurrency.format(factory.cards.netProfit || 0)}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel sm:p-6">
          <SectionTitle eyebrow="Product output" title="Production by block size" detail={periodLabel} />
          <div className="mt-6 space-y-5">
            {(dashboard?.productProduction || ["40mm", "60mm", "80mm"].map((size) => ({ size, blocks: 0 }))).map((item) => (
              <div key={item.size}>
                <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                  <span className="font-bold text-slate-800">{item.size}</span>
                  <span className="font-black text-slate-950">{formatNumber.format(item.blocks || 0)} blocks</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${Math.max(item.blocks ? 4 : 0, (Number(item.blocks) / maxProductBlocks) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel sm:p-6">
          <SectionTitle eyebrow="Dispatch control" title="Order fulfilment" detail={periodLabel} />
          <div className="mt-5 grid grid-cols-2 gap-3">
            <InsightStat label="Dispatched blocks" value={dashboard?.dispatchInsight?.dispatchedBlocks} />
            <InsightStat label="Pending blocks" value={dashboard?.dispatchInsight?.pendingBlocks} />
            <InsightStat label="Partial orders" value={dashboard?.dispatchInsight?.partialOrders} />
            <InsightStat label="Urgent / overdue" value={dashboard?.crmInsight?.urgentOrders} />
          </div>
          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Pending by color</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {dashboard?.dispatchInsight?.pendingByColor?.length ? dashboard.dispatchInsight.pendingByColor.map((item) => (
                <span key={item.color} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                  {item.color} <strong className="ml-1 text-slate-950">{formatNumber.format(item.blocks)}</strong>
                </span>
              )) : <p className="text-sm text-slate-500">No pending color dispatch.</p>}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel sm:p-6">
          <SectionTitle eyebrow="CRM insight" title="Order pipeline" />
          <div className="mt-5 grid grid-cols-2 gap-3">
            <InsightStat label="Active orders" value={dashboard?.crmInsight?.activeOrders} />
            <InsightStat label="Pending orders" value={dashboard?.crmInsight?.pendingOrders} />
            <InsightStat label="Completed orders" value={dashboard?.crmInsight?.completedOrders} />
            <InsightStat label="Custom color orders" value={dashboard?.crmInsight?.customOrders} />
            <InsightStat label="Urgent / overdue" value={dashboard?.crmInsight?.urgentOrders} />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel sm:p-6">
          <SectionTitle eyebrow="Attention required" title="Important alerts" />
          <div className="mt-5 space-y-3">
            {dashboard?.alerts?.length ? dashboard.alerts.slice(0, 7).map((alert, index) => (
              <div key={`${alert.title}-${index}`} className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" />
                <div><p className="text-sm font-bold text-slate-900">{alert.title}</p><p className="mt-1 text-xs leading-5 text-slate-600">{alert.detail}</p></div>
              </div>
            )) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">No operational alerts for the selected view.</div>
            )}
            {!dashboard?.availability?.lowStockThresholds && (
              <div className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-slate-400" />
                <div><p className="text-sm font-bold text-slate-900">Low-stock alerts not configured</p><p className="mt-1 text-xs leading-5 text-slate-600">Add minimum stock thresholds by product and color for accurate alerts.</p></div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-panel">
          <div className="border-b border-slate-100 px-5 py-4 sm:px-6"><SectionTitle eyebrow="Activity stream" title="Recent business updates" detail={periodLabel} /></div>
          <div className="divide-y divide-slate-100">
            {dashboard?.recentActivity?.length ? dashboard.recentActivity.map((activity, index) => (
              <div key={`${activity.Timestamp}-${index}`} className="flex gap-4 px-5 py-4 sm:px-6">
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500 ring-4 ring-brand-50" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-semibold text-slate-900">{activity.Description || activity.Action || "ERP update"}</p>
                    <time className="shrink-0 text-xs text-slate-400">{activity.Timestamp || ""}</time>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{activity.Module || "General"}{activity.Action ? ` | ${activity.Action}` : ""}</p>
                </div>
              </div>
            )) : <div className="px-6 py-12 text-center text-sm text-slate-500">No activity recorded for this period.</div>}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel sm:p-6">
          <SectionTitle eyebrow={ownerView ? "Owner actions" : "Quick actions"} title={ownerView ? "Business controls" : "Start an entry"} />
          <div className="mt-5 space-y-3">
            {actions.map((action) => (
              <Link key={action.path} to={action.path} className="focus-ring flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-[10px] font-black">{action.code}</span>
                {action.label}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
