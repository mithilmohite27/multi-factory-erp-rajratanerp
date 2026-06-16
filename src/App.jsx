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
  useFactory,
} from "./lib/factories";
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

function BrandMark() {
  return logoUrl ? (
    <img
      src={logoUrl}
      alt={CLIENT_CONFIG.companyName}
      className="h-12 w-12 shrink-0 rounded-xl bg-white object-cover shadow-sm"
    />
  ) : (
    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white text-sm font-black text-brand-800 shadow-sm">
      {CLIENT_CONFIG.brandInitials}
    </span>
  );
}

function Sidebar({ isOpen, closeSidebar, user }) {
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
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-white/[0.07] bg-[#091713] text-white shadow-2xl transition-transform duration-200 lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 border-b border-white/[0.07] px-5 py-5">
          <BrandMark />
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold tracking-wide">
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

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {visibleModules.map((module) => (
            <NavLink
              key={module.key}
              to={module.path}
              end={module.path === "/"}
              onClick={closeSidebar}
              className={({ isActive }) =>
                `focus-ring flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? "bg-white/[0.11] text-white shadow-inner"
                    : "text-white/55 hover:bg-white/[0.06] hover:text-white"
                }`
              }
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.05] text-[10px] font-extrabold">
                {module.shortLabel}
              </span>
              <span>{module.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/[0.07] px-5 py-4">
          <p className="truncate text-xs font-semibold text-white/70">
            {user.email}
          </p>
          <p className="mt-1 text-xs text-white/35">{CLIENT_CONFIG.poweredBy}</p>
        </div>
      </aside>
    </>
  );
}

function LoadingScreen() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#07110f] text-white">
      <div className="text-center">
        <BrandMark />
        <p className="mt-4 text-sm text-white/50">Securing your workspace...</p>
      </div>
    </div>
  );
}

function FactorySwitcher() {
  const {
    accessibleFactories,
    canSeeAllFactories,
    selectedFactoryId,
    setFactoryId,
  } = useFactory();

  return (
    <label className="hidden items-center gap-2 text-xs font-semibold text-slate-500 sm:flex">
      <span>View</span>
      <select
        value={selectedFactoryId}
        onChange={(event) => setFactoryId(event.target.value)}
        className="focus-ring rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
      >
        {canSeeAllFactories && (
          <option value={ALL_FACTORY_ID}>All factories</option>
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
  const { selectedFactoryId } = useFactory();

  return (
    <div className="min-h-screen bg-[#f4f7f6]">
      <Sidebar
        isOpen={isSidebarOpen}
        closeSidebar={() => setIsSidebarOpen(false)}
        user={user}
      />

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
          <div className="flex min-h-16 items-center gap-4 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              aria-label="Open navigation"
              className="focus-ring rounded-xl border border-slate-200 p-2 text-slate-700 lg:hidden"
              onClick={() => setIsSidebarOpen(true)}
            >
              <span className="block h-0.5 w-5 bg-current" />
              <span className="mt-1 block h-0.5 w-5 bg-current" />
              <span className="mt-1 block h-0.5 w-5 bg-current" />
            </button>

            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900">
                {CLIENT_CONFIG.companyName}
              </p>
              <p className="hidden truncate text-xs text-slate-500 sm:block">
                {factoryLabel(selectedFactoryId)} | {CLIENT_CONFIG.address}
              </p>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <FactorySwitcher />
              <span className="hidden text-right md:block">
                <span className="block text-xs font-semibold text-slate-800">
                  {user.name}
                </span>
                <span className="block text-[11px] text-slate-400">
                  {user.role}
                </span>
              </span>
              <button
                type="button"
                onClick={logout}
                className="focus-ring rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
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

        <footer className="border-t border-slate-200 bg-white px-4 py-5 text-xs text-slate-500 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <span>{CLIENT_CONFIG.companyName}</span>
            <span>
              {CLIENT_CONFIG.phone} | {CLIENT_CONFIG.poweredBy}
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
