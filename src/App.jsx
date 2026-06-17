import { useEffect, useRef, useState } from "react";
import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { CLIENT_CONFIG } from "./lib/clientConfig";
import { MODULES } from "./lib/constants";
import { useAuth } from "./lib/authContext";
import { logoUrl } from "./lib/branding";
import {
  ALL_FACTORY_ID,
  FactoryProvider,
  canAccessModule,
  factoryLabel,
  isSuperAdmin,
  useFactory,
} from "./lib/factories";
import { LANGUAGES, useI18n } from "./lib/i18n";
import BillsChallans from "./pages/BillsChallans";
import CashRegister from "./pages/CashRegister";
import CRM from "./pages/CRM";
import Dashboard from "./pages/Dashboard";
import Dispatch from "./pages/Dispatch";
import FinishedBlockInventory from "./pages/FinishedBlockInventory";
import Login from "./pages/Login";
import MaterialInventory from "./pages/MaterialInventory";
import Payroll from "./pages/Payroll";
import ProductionLog from "./pages/ProductionLog";
import ProfitLoss from "./pages/ProfitLoss";
import QC from "./pages/QC";
import ReportsCenter from "./pages/ReportsCenter";
import Settings from "./pages/Settings";
import VendorLedger from "./pages/VendorLedger";

const routes = [
  { moduleKey: "dashboard", path: "/", element: <Dashboard /> },
  { moduleKey: "production-log", path: "/production-log", element: <ProductionLog /> },
  { moduleKey: "material-inventory", path: "/material-inventory", element: <MaterialInventory /> },
  { moduleKey: "finished-block-inventory", path: "/finished-block-inventory", element: <FinishedBlockInventory /> },
  { moduleKey: "crm", path: "/crm", element: <CRM /> },
  { moduleKey: "dispatch", path: "/dispatch", element: <Dispatch /> },
  { moduleKey: "qc", path: "/qc", element: <QC /> },
  { moduleKey: "vendor-ledger", path: "/vendor-ledger", element: <VendorLedger /> },
  { moduleKey: "payroll", path: "/payroll", element: <Payroll /> },
  { moduleKey: "cash-register", path: "/cash-register", element: <CashRegister /> },
  { moduleKey: "profit-loss", path: "/profit-loss", element: <ProfitLoss /> },
  { moduleKey: "bills-challans", path: "/bills-challans", element: <BillsChallans /> },
  { moduleKey: "reports-center", path: "/reports-center", element: <ReportsCenter /> },
  { moduleKey: "settings", path: "/settings", element: <Settings /> },
];

const MODULE_GROUPS = [
  {
    label: "Owner",
    labelKey: "owner",
    keys: ["dashboard", "reports-center", "settings"],
  },
  {
    label: "Operations",
    labelKey: "operations",
    keys: [
      "production-log",
      "material-inventory",
      "finished-block-inventory",
      "qc",
    ],
  },
  {
    label: "Sales & Dispatch",
    labelKey: "salesDispatch",
    keys: ["crm", "dispatch", "bills-challans"],
  },
  {
    label: "Finance",
    labelKey: "finance",
    keys: ["vendor-ledger", "payroll", "cash-register", "profit-loss"],
  },
];

function BrandMark() {
  return logoUrl ? (
    <img
      src={logoUrl}
      alt={CLIENT_CONFIG.companyName}
      className="h-12 w-12 shrink-0 rounded-xl bg-white object-cover shadow-sm"
    />
  ) : (
    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-sm font-black tracking-tight text-brand-900 shadow-sm ring-1 ring-white/70">
      {CLIENT_CONFIG.brandInitials}
    </span>
  );
}

function displayNameForUser(user, t) {
  const name = String(user?.name || "").trim();
  if (name && !name.includes("@")) return name;
  return translatedRole(user?.role, t) || "User";
}

function factoryDisplayForUser(user, accessibleFactories) {
  if (isSuperAdmin(user)) return "1, 2, 3";
  if (accessibleFactories.length === 0) return "-";
  return accessibleFactories.map((factory) => factory.name).join(", ");
}

function profileMetaForUser(user, accessibleFactories, t) {
  if (isSuperAdmin(user)) {
    return `${translatedRole(user.role, t)} • ${t("factories.all")}`;
  }
  return accessibleFactories.length
    ? accessibleFactories.map((factory) => factory.name).join(", ")
    : translatedRole(user.role, t);
}

function Sidebar({ isOpen, closeSidebar, user }) {
  const { t, language } = useI18n();
  const { accessibleFactories } = useFactory();
  const ownerView = isSuperAdmin(user);
  const visibleModules = MODULES.filter((module) =>
    canAccessModule(user, module.key),
  );

  return (
    <>
      {isOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-slate-950/60 backdrop-blur-sm lg:hidden"
          onClick={closeSidebar}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-white/[0.08] bg-[#071410] text-white shadow-2xl transition-transform duration-200 lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="border-b border-white/[0.07] px-5 py-5">
          <div className="flex items-center gap-3">
          <BrandMark />
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold tracking-[0.14em]">
              {CLIENT_CONFIG.appName}
            </p>
            <p className="mt-0.5 text-xs text-white/45">
              {CLIENT_CONFIG.tagline}
            </p>
          </div>
          <button
            type="button"
            className="focus-ring ml-auto rounded-lg p-2 text-white/60 hover:bg-white/10 lg:hidden"
            aria-label="Close menu"
            onClick={closeSidebar}
          >
            &#10005;
          </button>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
              <p className="text-white/35">
                {ownerView
                  ? t("app.factories")
                  : language === LANGUAGES.HI
                    ? "असाइन फैक्ट्री"
                    : "Assigned Factory"}
              </p>
              <p className="mt-1 truncate font-black">
                {factoryDisplayForUser(user, accessibleFactories)}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
              <p className="text-white/35">{t("app.language")}</p>
              <p className="mt-1 font-black">
                {language === LANGUAGES.HI ? "हिंदी" : "English"}
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {MODULE_GROUPS.map((group) => {
            const groupModules = visibleModules.filter((module) =>
              group.keys.includes(module.key),
            );
            if (groupModules.length === 0) return null;

            return (
              <div key={group.label} className="mb-5 last:mb-0">
                <p className="mb-2 px-3 text-[10px] font-black uppercase tracking-[0.18em] text-white/30">
                  {t(`groups.${group.labelKey}`)}
                </p>
                <div className="space-y-1">
                  {groupModules.map((module) => (
                    <NavLink
                      key={module.key}
                      to={module.path}
                      end={module.path === "/"}
                      onClick={closeSidebar}
                      className={({ isActive }) =>
                        `focus-ring flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                          isActive
                            ? "bg-white text-brand-900 shadow-lg shadow-black/10"
                            : "text-white/58 hover:bg-white/[0.07] hover:text-white"
                        }`
                      }
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-current/10 bg-current/[0.05] text-[10px] font-black">
                        {module.shortLabel}
                      </span>
                      <span className="truncate">
                        {t(`modules.${module.key}`)}
                      </span>
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-white/[0.07] px-5 py-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <p className="truncate text-xs font-bold text-white/75">
              {displayNameForUser(user, t)}
            </p>
            <p className="mt-1 truncate text-xs text-white/45">
              {profileMetaForUser(user, accessibleFactories, t)}
            </p>
            <p className="mt-3 border-t border-white/10 pt-2 text-[11px] text-white/28">
              {CLIENT_CONFIG.poweredBy}
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}

function LoadingScreen() {
  const { t } = useI18n();

  return (
    <div className="grid min-h-screen place-items-center bg-[#07110f] text-white">
      <div className="text-center">
        <BrandMark />
        <p className="mt-4 text-sm text-white/50">{t("app.loading")}</p>
      </div>
    </div>
  );
}

function LanguageToggle() {
  const { language, setLanguage, t } = useI18n();

  return (
    <label className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-1.5 py-1 text-xs font-bold text-slate-600 shadow-sm">
      <span className="sr-only">{t("app.language")}</span>
      <button
        type="button"
        onClick={() => setLanguage(LANGUAGES.EN)}
        className={`rounded-full px-3 py-1.5 transition ${
          language === LANGUAGES.EN
            ? "bg-brand-700 text-white"
            : "text-slate-500 hover:bg-slate-50"
        }`}
      >
        <span className="hidden md:inline">English</span>
        <span className="md:hidden">EN</span>
      </button>
      <button
        type="button"
        onClick={() => setLanguage(LANGUAGES.HI)}
        className={`rounded-full px-3 py-1.5 transition ${
          language === LANGUAGES.HI
            ? "bg-brand-700 text-white"
            : "text-slate-500 hover:bg-slate-50"
        }`}
      >
        हिंदी
      </button>
    </label>
  );
}

function translatedRole(role, t) {
  const key = String(role || "").trim().toLowerCase();
  if (key === "super admin") return t("app.role.superAdmin");
  if (key === "factory admin") return t("app.role.factoryAdmin");
  if (key === "supervisor") return t("app.role.supervisor");
  if (key === "operator") return t("app.role.operator");
  return role;
}

function FactorySwitcher() {
  const { t } = useI18n();
  const {
    accessibleFactories,
    canSeeAllFactories,
    selectedFactoryId,
    setFactoryId,
  } = useFactory();
  const canSwitchFactory = canSeeAllFactories || accessibleFactories.length > 1;

  if (!canSwitchFactory) {
    return (
      <div className="hidden items-center gap-2 text-xs font-semibold text-slate-500 md:flex">
        <span className="hidden xl:inline">{t("app.factoryView")}</span>
        <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-800 shadow-sm">
          {accessibleFactories[0]?.name || factoryLabel(selectedFactoryId)}
        </span>
      </div>
    );
  }

  return (
    <label className="hidden items-center gap-2 text-xs font-semibold text-slate-500 md:flex">
      <span className="hidden xl:inline">{t("app.factoryView")}</span>
      <select
        value={selectedFactoryId}
        onChange={(event) => setFactoryId(event.target.value)}
        className="focus-ring rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 shadow-sm"
      >
        {canSeeAllFactories && (
          <option value={ALL_FACTORY_ID}>{t("factories.all")}</option>
        )}
        {accessibleFactories.map((factory) => (
          <option key={factory.id} value={factory.id}>
            {factory.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function AuthenticatedShell({ user, logout, isSidebarOpen, setIsSidebarOpen }) {
  const { t } = useI18n();
  const { selectedFactoryId } = useFactory();

  return (
    <div className="min-h-screen bg-[#f5f7f6]">
      <Sidebar
        isOpen={isSidebarOpen}
        closeSidebar={() => setIsSidebarOpen(false)}
        user={user}
      />

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/88 shadow-sm shadow-slate-200/40 backdrop-blur-xl">
          <div className="flex min-h-[72px] items-center gap-4 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              aria-label="Open navigation"
              className="focus-ring rounded-xl border border-slate-200 bg-white p-2 text-slate-700 shadow-sm lg:hidden"
              onClick={() => setIsSidebarOpen(true)}
            >
              <span className="block h-0.5 w-5 bg-current" />
              <span className="mt-1 block h-0.5 w-5 bg-current" />
              <span className="mt-1 block h-0.5 w-5 bg-current" />
            </button>

            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-950">
                {CLIENT_CONFIG.companyName}
              </p>
              <p className="hidden truncate text-xs text-slate-500 sm:block">
                {selectedFactoryId === ALL_FACTORY_ID
                  ? t("factories.all")
                  : factoryLabel(selectedFactoryId)} | {CLIENT_CONFIG.address} | {CLIENT_CONFIG.industry}
              </p>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <LanguageToggle />
              <FactorySwitcher />
              <span className="hidden rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-right md:block">
                <span className="block text-xs font-semibold text-slate-800">
                  {user.name}
                </span>
                <span className="block text-[11px] text-slate-400">
                  {translatedRole(user.role, t)}
                </span>
              </span>
              <button
                type="button"
                onClick={logout}
                className="focus-ring rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
              >
                {t("app.logout")}
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1520px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Routes>
            {routes
              .filter((route) => canAccessModule(user, route.moduleKey))
              .map((route) => (
                <Route
                  key={route.path}
                  path={route.path}
                  element={route.element}
                />
              ))}
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </main>

        <footer className="border-t border-slate-200 bg-white/80 px-4 py-5 text-xs text-slate-500 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1520px] flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <span>{CLIENT_CONFIG.companyName}</span>
            <span>
              {CLIENT_CONFIG.phone} | {CLIENT_CONFIG.email} | {CLIENT_CONFIG.poweredBy}
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}

function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { user, status, logout } = useAuth();
  const navigate = useNavigate();
  const redirectedAfterAuth = useRef(false);

  useEffect(() => {
    if (status === "authenticated" && user && !redirectedAfterAuth.current) {
      redirectedAfterAuth.current = true;
      navigate("/", { replace: true });
    } else if (status !== "authenticated") {
      redirectedAfterAuth.current = false;
    }
  }, [navigate, status, user]);

  if (status === "checking") return <LoadingScreen />;
  if (status !== "authenticated" || !user) return <Login />;

  return (
    <FactoryProvider>
      <AuthenticatedShell
        user={user}
        logout={logout}
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
      />
    </FactoryProvider>
  );
}

export default App;
