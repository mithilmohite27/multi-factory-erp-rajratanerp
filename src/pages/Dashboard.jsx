import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CLIENT_CONFIG } from "../lib/clientConfig";
import {
  refreshFactoryCalculations,
} from "../lib/sheets";
import { useAuth } from "../lib/authContext";
import {
  ALL_FACTORY_ID,
  canAccessModule,
  factoryLabel,
  isSuperAdmin,
  useFactory,
} from "../lib/factories";
import { useI18n } from "../lib/i18n";

const formatNumber = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
});
const formatCurrency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const cards = [
  { key: "todaysProduction", labelKey: "dashboard.todaysProduction", type: "number", code: "TP" },
  { key: "currentStock", labelKey: "dashboard.currentStock", type: "number", code: "CS" },
  { key: "todaysRevenue", labelKey: "dashboard.todaysRevenue", type: "currency", code: "TR" },
  { key: "pendingOrders", labelKey: "dashboard.pendingOrders", type: "number", code: "PO" },
  { key: "vendorOutstanding", labelKey: "dashboard.vendorOutstanding", type: "currency", code: "VO" },
  { key: "cashBalance", labelKey: "dashboard.cashBalance", type: "currency", code: "CB" },
  { key: "netProfit", labelKey: "dashboard.netProfit", type: "currency", code: "NP" },
  { key: "qcLoss", labelKey: "dashboard.qcLoss", type: "currency", code: "QL" },
  { key: "payrollDue", labelKey: "dashboard.payrollDue", type: "currency", code: "PD" },
];

const quickActions = [
  { labelKey: "quick.addProduction", path: "/production-log", code: "PL" },
  { labelKey: "quick.newCrmEntry", path: "/crm", code: "CR" },
  { labelKey: "quick.recordDispatch", path: "/dispatch", code: "DS" },
  { labelKey: "quick.enterCashFlow", path: "/cash-register", code: "CA" },
];

function formatCardValue(card, value) {
  return card.type === "currency"
    ? formatCurrency.format(Number(value) || 0)
    : formatNumber.format(Number(value) || 0);
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const { selectedFactoryId } = useFactory();
  const { t } = useI18n();
  const [dashboard, setDashboard] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setStatus("loading");
    setError("");

    try {
      const freshDashboard = await refreshFactoryCalculations(selectedFactoryId);
      setDashboard(freshDashboard);
      setStatus("ready");
    } catch (requestError) {
      if (requestError.status === 401 || requestError.status === 403) {
        logout();
        return;
      }
      setError(requestError.message);
      setStatus("error");
    }
  }, [logout, selectedFactoryId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-brand-900 via-[#102c26] to-[#091713] px-6 py-7 text-white shadow-2xl shadow-black/10 sm:px-8 sm:py-9">
        <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-sand-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-sand-300">
              {t("dashboard.overview", {
                factory:
                  selectedFactoryId === ALL_FACTORY_ID
                    ? t("factories.all")
                    : factoryLabel(selectedFactoryId),
              })}
            </p>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">
              {CLIENT_CONFIG.companyName}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">
              {t("dashboard.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={status === "loading"}
            className="focus-ring inline-flex w-fit items-center rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-wait disabled:opacity-60"
          >
            {status === "loading" ? t("dashboard.refreshing") : t("dashboard.refresh")}
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {t("dashboard.liveDataError")}
          {" "}{error}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <article
            key={card.key}
            className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-panel transition hover:-translate-y-0.5 hover:border-brand-200"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-500">
                  {t(card.labelKey)}
                </p>
                <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">
                  {dashboard
                    ? formatCardValue(card, dashboard.cards?.[card.key])
                    : "--"}
                </p>
              </div>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-[11px] font-black text-brand-700">
                {card.code}
              </span>
            </div>
          </article>
        ))}
      </section>

      {selectedFactoryId === ALL_FACTORY_ID &&
        dashboard?.factoryBreakdown?.length > 0 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel sm:p-6">
            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">
                {t("dashboard.factoryWiseControl")}
              </p>
              <h2 className="mt-1 text-lg font-bold text-slate-900">
                {t("dashboard.allFactoryPerformance")}
              </h2>
            </div>
            <div className="grid gap-4 xl:grid-cols-3">
              {dashboard.factoryBreakdown.map((factory) => (
                <article
                  key={factory.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <h3 className="font-black text-slate-900">{factory.name}</h3>
                  <div className="mt-4 grid gap-3 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">{t("dashboard.productionToday")}</span>
                      <strong>{formatNumber.format(factory.cards.todaysProduction || 0)}</strong>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">{t("dashboard.currentStock")}</span>
                      <strong>{formatNumber.format(factory.cards.currentStock || 0)}</strong>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">{t("dashboard.revenueToday")}</span>
                      <strong>{formatCurrency.format(factory.cards.todaysRevenue || 0)}</strong>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">{t("dashboard.pendingOrders")}</span>
                      <strong>{formatNumber.format(factory.cards.pendingOrders || 0)}</strong>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

      <section className="grid gap-6 xl:grid-cols-[1.5fr_0.8fr]">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-panel">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">
                {t("dashboard.recentActivity")}
              </p>
              <h2 className="mt-1 text-lg font-bold text-slate-900">
                {t("dashboard.latestUpdates")}
              </h2>
            </div>
            <Link
              to="/reports-center"
              className="focus-ring rounded-lg px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
            >
              {t("dashboard.viewReports")}
            </Link>
          </div>

          <div className="divide-y divide-slate-100">
            {dashboard?.recentActivity?.length ? (
              dashboard.recentActivity.map((activity, index) => (
                <div
                  key={`${activity.Timestamp}-${index}`}
                  className="flex gap-4 px-5 py-4 sm:px-6"
                >
                  <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500 ring-4 ring-brand-50" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {activity.Description || activity.Action || "ERP update"}
                      </p>
                      <time className="shrink-0 text-xs text-slate-400">
                        {activity.Timestamp || ""}
                      </time>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {activity.Module || "General"}
                      {activity.Action ? ` | ${activity.Action}` : ""}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-6 py-12 text-center text-sm text-slate-500">
                {t("dashboard.emptyActivity")}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">
            {isSuperAdmin(user) ? t("dashboard.ownerActions") : t("dashboard.quickActions")}
          </p>
          <h2 className="mt-1 text-lg font-bold text-slate-900">
            {isSuperAdmin(user) ? t("dashboard.manageCompany") : t("dashboard.startEntry")}
          </h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {(isSuperAdmin(user)
              ? [
                  { labelKey: "dashboard.manageUserAccess", path: "/settings", code: "UA" },
                  { labelKey: "dashboard.viewReports", path: "/reports-center", code: "RC" },
                ]
              : quickActions.filter((action) =>
                  canAccessModule(
                    user,
                    {
                      "/production-log": "production-log",
                      "/crm": "crm",
                      "/dispatch": "dispatch",
                      "/cash-register": "cash-register",
                    }[action.path],
                  ),
                )
            ).map((action) => (
              <Link
                key={action.path}
                to={action.path}
                className="focus-ring flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800"
              >
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-[10px] font-black text-slate-600">
                  {action.code}
                </span>
                {t(action.labelKey)}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
