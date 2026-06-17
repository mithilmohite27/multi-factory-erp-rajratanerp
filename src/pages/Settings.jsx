import { useCallback, useEffect, useState } from "react";
import { Message, PageHeader } from "../components/WorkflowUI";
import { CLIENT_CONFIG } from "../lib/clientConfig";
import { useAuth } from "../lib/authContext";
import {
  DASHBOARD_SHEETS,
  clearLocalCache,
  getConfig,
  getCachedSheetData,
  getUsers,
  appendRows,
  ensureSheetHeaders,
  refreshAllCalculations,
  saveProductionSettings,
  saveUserAccess,
  syncFromSheets,
  updateRow,
} from "../lib/sheets";
import { STOCK_THRESHOLD_HEADERS } from "../lib/sheetSchemas";
import { BLOCK_COLORS, MODULES, PRODUCT_SIZES } from "../lib/constants";
import { FACTORIES, ROLES, isSuperAdmin } from "../lib/factories";
import {
  EMPTY_PRODUCTION_SETTINGS,
  PRODUCTION_SETTING_FIELDS,
  hasCompleteProductionSettings,
} from "../lib/productionSettings";

const configuredGoogleClient = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);

const emptyUserAccessForm = () => ({
  User_ID: "",
  Email: "",
  Name: "",
  Role: ROLES.FACTORY_ADMIN,
  Factory_IDs: [FACTORIES[0].id],
  Permissions: [
    "dashboard",
    "production-log",
    "crm",
    "dispatch",
    "payroll",
    "reports-center",
  ],
  Status: "Active",
});

const emptyThresholdForm = () => ({
  factoryId: FACTORIES[0].id,
  productSize: PRODUCT_SIZES[0],
  color: BLOCK_COLORS[0],
  minimumBlocks: "",
});

function Detail({ label, value }) {
  return (
    <div className="border-b border-slate-100 py-3 last:border-0">
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-semibold text-slate-800">
        {value}
      </dd>
    </div>
  );
}

function StatusBadge({ healthy, children }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
        healthy
          ? "bg-emerald-50 text-emerald-700"
          : "bg-amber-50 text-amber-700"
      }`}
    >
      {children}
    </span>
  );
}

function SettingField({ field, value, onChange }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">
        {field.label}
      </span>
      <input
        type="number"
        name={field.key}
        value={value}
        onChange={onChange}
        min="0"
        step="any"
        className="focus-ring w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900"
      />
    </label>
  );
}

export default function Settings() {
  const { user, logout } = useAuth();
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [connectionHealthy, setConnectionHealthy] = useState(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [productionSettings, setProductionSettings] = useState(
    EMPTY_PRODUCTION_SETTINGS,
  );
  const [accessUsers, setAccessUsers] = useState([]);
  const [accessForm, setAccessForm] = useState(emptyUserAccessForm);
  const [stockThresholds, setStockThresholds] = useState([]);
  const [thresholdForm, setThresholdForm] = useState(emptyThresholdForm);
  const [, setCacheVersion] = useState(0);
  const canManageAccess = isSuperAdmin(user);
  const cachedData = getCachedSheetData();
  const cachedSheets = DASHBOARD_SHEETS.map((sheetName) => ({
    sheetName,
    rowCount: cachedData[sheetName]?.length || 0,
  }));

  const cachedRowCount = cachedSheets.reduce(
    (total, sheet) => total + sheet.rowCount,
    0,
  );

  const checkConnection = async () => {
    setStatus("checking");
    setMessage("");

    try {
      await refreshAllCalculations();
      setConnectionHealthy(true);
      setCacheVersion((version) => version + 1);
      setMessage("Workbook connection verified and local data refreshed.");
    } catch (error) {
      if ([401, 403].includes(error.status)) {
        logout();
        return;
      }
      setConnectionHealthy(false);
      setMessage(error.message);
    } finally {
      setStatus("idle");
    }
  };

  const loadSettings = useCallback(async () => {
    setStatus("loading-settings");
    setMessage("");

    try {
      const config = await getConfig();
      setProductionSettings(
        config.productionSettings || EMPTY_PRODUCTION_SETTINGS,
      );
      setSettingsLoaded(true);
      setMessage("Production settings loaded from Google Sheet.");
    } catch (error) {
      if ([401, 403].includes(error.status)) {
        logout();
        return;
      }
      setMessage(error.message);
    } finally {
      setStatus("idle");
    }
  }, [logout]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const loadUsers = useCallback(async () => {
    if (!canManageAccess) return;
    setStatus("loading-users");
    setMessage("");

    try {
      setAccessUsers(await getUsers());
    } catch (error) {
      if ([401, 403].includes(error.status)) {
        logout();
        return;
      }
      setMessage(error.message);
    } finally {
      setStatus("idle");
    }
  }, [canManageAccess, logout]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const loadStockThresholds = useCallback(async () => {
    if (!canManageAccess) return;
    try {
      await ensureSheetHeaders("Stock_Thresholds", STOCK_THRESHOLD_HEADERS);
      const data = await syncFromSheets(["Stock_Thresholds"]);
      setStockThresholds(data.Stock_Thresholds || []);
    } catch (error) {
      if ([401, 403].includes(error.status)) logout();
      else setMessage(error.message);
    }
  }, [canManageAccess, logout]);

  useEffect(() => {
    loadStockThresholds();
  }, [loadStockThresholds]);

  const saveStockThreshold = async (event) => {
    event.preventDefault();
    const minimumBlocks = Number(thresholdForm.minimumBlocks);
    if (!Number.isFinite(minimumBlocks) || minimumBlocks < 0) {
      setMessage("Enter a valid minimum stock quantity.");
      return;
    }
    setStatus("saving-threshold");
    const existing = stockThresholds.find(
      (row) =>
        row.Factory_ID === thresholdForm.factoryId &&
        row.Product_Size === thresholdForm.productSize &&
        row.Color === thresholdForm.color,
    );
    const row = {
      Factory_ID: thresholdForm.factoryId,
      Threshold_ID: existing?.Threshold_ID || `STOCK-${crypto.randomUUID()}`,
      Product_Size: thresholdForm.productSize,
      Color: thresholdForm.color,
      Minimum_Blocks: minimumBlocks,
      Updated_At: new Date().toISOString(),
    };
    try {
      if (existing) await updateRow("Stock_Thresholds", existing._rowIndex, row);
      else await appendRows([{ sheetName: "Stock_Thresholds", row }], ["Stock_Thresholds"]);
      await loadStockThresholds();
      setThresholdForm(emptyThresholdForm());
      setMessage("Finished-stock threshold saved.");
    } catch (error) {
      if ([401, 403].includes(error.status)) logout();
      else setMessage(error.message);
    } finally {
      setStatus("idle");
    }
  };

  const saveSettings = async (event) => {
    event.preventDefault();
    setStatus("saving-settings");
    setMessage("");

    try {
      if (!hasCompleteProductionSettings(productionSettings)) {
        setMessage("Complete all production settings before saving.");
        setStatus("idle");
        return;
      }
      const savedSettings = await saveProductionSettings(productionSettings);
      setProductionSettings(savedSettings);
      setSettingsLoaded(true);
      setMessage("Production costing settings saved to Google Sheet.");
    } catch (error) {
      if ([401, 403].includes(error.status)) {
        logout();
        return;
      }
      setMessage(error.message);
    } finally {
      setStatus("idle");
    }
  };

  const updateProductionSetting = ({ target }) => {
    setProductionSettings((current) => ({
      ...current,
      [target.name]: target.value,
    }));
  };

  const clearCache = () => {
    clearLocalCache();
    setCacheVersion((version) => version + 1);
    setMessage("Local ERP cache cleared. Live data will reload on the next visit.");
  };

  const updateAccessField = ({ target }) => {
    const { name, value } = target;
    setAccessForm((current) => ({
      ...current,
      [name]: value,
      ...(name === "Role" && value === ROLES.SUPER_ADMIN
        ? { Factory_IDs: [] }
        : {}),
    }));
  };

  const toggleAccessListValue = (field, value) => {
    setAccessForm((current) => {
      const values = new Set(current[field] || []);
      if (values.has(value)) values.delete(value);
      else values.add(value);
      return { ...current, [field]: [...values] };
    });
  };

  const editAccessUser = (row) => {
    setAccessForm({
      User_ID: row.User_ID || "",
      Email: row.Email || "",
      Name: row.Name || "",
      Role: row.Role || ROLES.OPERATOR,
      Factory_IDs: String(row.Factory_IDs || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      Permissions: String(row.Permissions || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      Status: row.Status || "Active",
    });
    setMessage(`Editing access for ${row.Email}.`);
  };

  const saveAccessUser = async (event) => {
    event.preventDefault();
    setStatus("saving-user");
    setMessage("");

    try {
      setAccessUsers(await saveUserAccess(accessForm));
      setAccessForm(emptyUserAccessForm());
      setMessage("User access saved.");
    } catch (error) {
      if ([401, 403].includes(error.status)) {
        logout();
        return;
      }
      setMessage(error.message);
    } finally {
      setStatus("idle");
    }
  };

  const deactivateAccessUser = async (row) => {
    setStatus("saving-user");
    setMessage("");

    try {
      setAccessUsers(
        await saveUserAccess({
          ...row,
          Status: row.Status === "Inactive" ? "Active" : "Inactive",
        }),
      );
      setMessage(
        row.Status === "Inactive" ? "User reactivated." : "User deactivated.",
      );
    } catch (error) {
      if ([401, 403].includes(error.status)) {
        logout();
        return;
      }
      setMessage(error.message);
    } finally {
      setStatus("idle");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Settings"
        description="Review company identity, workbook connectivity, local data, and the authorized administrator session."
      />

      <Message>{message}</Message>

      {canManageAccess && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
          <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">
                User access
              </p>
              <h2 className="mt-2 text-lg font-black text-slate-900">
                Factory users and permissions
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Add users by Google email, assign their role, choose factories,
                and control which ERP modules they can open.
              </p>
            </div>
            <button
              type="button"
              onClick={loadUsers}
              disabled={status === "loading-users"}
              className="focus-ring rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
            >
              {status === "loading-users" ? "Loading..." : "Refresh users"}
            </button>
          </div>

          <form onSubmit={saveAccessUser} className="mt-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">
                  Google email
                </span>
                <input
                  name="Email"
                  type="email"
                  value={accessForm.Email}
                  onChange={updateAccessField}
                  className="focus-ring w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm"
                  required
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">
                  Name
                </span>
                <input
                  name="Name"
                  value={accessForm.Name}
                  onChange={updateAccessField}
                  className="focus-ring w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">
                  Role
                </span>
                <select
                  name="Role"
                  value={accessForm.Role}
                  onChange={updateAccessField}
                  className="focus-ring w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm"
                >
                  {Object.values(ROLES).map((role) => (
                    <option key={role}>{role}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">
                  Status
                </span>
                <select
                  name="Status"
                  value={accessForm.Status}
                  onChange={updateAccessField}
                  className="focus-ring w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm"
                >
                  <option>Active</option>
                  <option>Inactive</option>
                </select>
              </label>
            </div>

            {accessForm.Role !== ROLES.SUPER_ADMIN && (
              <div className="mt-5">
                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                  Factory access
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {FACTORIES.map((factory) => (
                    <label
                      key={factory.id}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={accessForm.Factory_IDs.includes(factory.id)}
                        onChange={() =>
                          toggleAccessListValue("Factory_IDs", factory.id)
                        }
                        className="h-4 w-4"
                      />
                      {factory.name}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5">
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                Module permissions
              </p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {MODULES.map((module) => (
                  <label
                    key={module.key}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={accessForm.Permissions.includes(module.key)}
                      onChange={() =>
                        toggleAccessListValue("Permissions", module.key)
                      }
                      className="h-4 w-4"
                    />
                    {module.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setAccessForm(emptyUserAccessForm())}
                className="focus-ring rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Reset
              </button>
              <button
                type="submit"
                disabled={status === "saving-user"}
                className="focus-ring rounded-xl bg-brand-700 px-5 py-3 text-sm font-bold text-white hover:bg-brand-800 disabled:cursor-wait disabled:opacity-60"
              >
                {status === "saving-user" ? "Saving..." : "Save user access"}
              </button>
            </div>
          </form>

          <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Factories</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accessUsers.map((row) => (
                  <tr key={row.User_ID || row.Email}>
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900">{row.Name}</p>
                      <p className="text-xs text-slate-500">{row.Email}</p>
                    </td>
                    <td className="px-4 py-3">{row.Role}</td>
                    <td className="px-4 py-3">
                      {row.Role === ROLES.SUPER_ADMIN
                        ? "All factories"
                        : row.Factory_IDs || "-"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge healthy={row.Status !== "Inactive"}>
                        {row.Status || "Active"}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => editAccessUser(row)}
                        className="focus-ring mr-2 rounded-lg px-3 py-2 text-xs font-bold text-brand-700 hover:bg-brand-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deactivateAccessUser(row)}
                        className="focus-ring rounded-lg px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50"
                      >
                        {row.Status === "Inactive" ? "Activate" : "Deactivate"}
                      </button>
                    </td>
                  </tr>
                ))}
                {!accessUsers.length && (
                  <tr>
                    <td
                      colSpan="5"
                      className="px-5 py-10 text-center text-slate-500"
                    >
                      No users have been added yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="grid gap-5 xl:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel xl:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">
                Company profile
              </p>
              <h2 className="mt-2 text-lg font-black text-slate-900">
                {CLIENT_CONFIG.companyName}
              </h2>
            </div>
          </div>

          <dl className="mt-4 grid gap-x-8 sm:grid-cols-2">
            <Detail label="Application" value={CLIENT_CONFIG.appName} />
            <Detail label="Phone" value={CLIENT_CONFIG.phone} />
            <Detail label="Currency" value={CLIENT_CONFIG.currency} />
            <div className="sm:col-span-2">
              <Detail label="Registered address" value={CLIENT_CONFIG.address} />
            </div>
          </dl>

          <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
            Company identity is currently a deployment setting. Production
            costing rates can be adjusted below and are saved to Google Sheets.
          </p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">
            Administrator
          </p>
          <div className="mt-4 flex items-center gap-3">
            {user.picture ? (
              <img
                src={user.picture}
                alt=""
                referrerPolicy="no-referrer"
                className="h-12 w-12 rounded-xl object-cover"
              />
            ) : (
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand-100 text-sm font-black text-brand-700">
                {user.name
                  .split(" ")
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900">
                {user.name}
              </p>
              <p className="truncate text-xs text-slate-500">{user.email}</p>
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
            <span className="text-xs font-semibold text-slate-500">Role</span>
            <StatusBadge healthy>{user.role}</StatusBadge>
          </div>
          <button
            type="button"
            onClick={logout}
            className="focus-ring mt-4 w-full rounded-xl border border-red-200 px-4 py-3 text-sm font-bold text-red-700 hover:bg-red-50"
          >
            Sign out
          </button>
        </article>
      </section>

      {canManageAccess && (
        <form onSubmit={saveStockThreshold} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">Inventory alerts</p>
            <h2 className="mt-2 text-lg font-black text-slate-900">Minimum finished-stock thresholds</h2>
            <p className="mt-2 text-sm text-slate-500">Set the minimum blocks required for each factory, size, and color.</p>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <label><span className="mb-2 block text-xs font-bold uppercase text-slate-500">Factory</span><select value={thresholdForm.factoryId} onChange={(event) => setThresholdForm((current) => ({ ...current, factoryId: event.target.value }))} className="focus-ring w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm">{FACTORIES.map((factory) => <option key={factory.id} value={factory.id}>{factory.name}</option>)}</select></label>
            <label><span className="mb-2 block text-xs font-bold uppercase text-slate-500">Product size</span><select value={thresholdForm.productSize} onChange={(event) => setThresholdForm((current) => ({ ...current, productSize: event.target.value }))} className="focus-ring w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm">{PRODUCT_SIZES.map((size) => <option key={size}>{size}</option>)}</select></label>
            <label><span className="mb-2 block text-xs font-bold uppercase text-slate-500">Color</span><select value={thresholdForm.color} onChange={(event) => setThresholdForm((current) => ({ ...current, color: event.target.value }))} className="focus-ring w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm">{BLOCK_COLORS.filter((color) => color !== "Custom").map((color) => <option key={color}>{color}</option>)}</select></label>
            <label><span className="mb-2 block text-xs font-bold uppercase text-slate-500">Minimum blocks</span><input type="number" min="0" value={thresholdForm.minimumBlocks} onChange={(event) => setThresholdForm((current) => ({ ...current, minimumBlocks: event.target.value }))} className="focus-ring w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm" required /></label>
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">{stockThresholds.length} thresholds configured</p>
            <button type="submit" disabled={status === "saving-threshold"} className="focus-ring rounded-xl bg-brand-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-60">{status === "saving-threshold" ? "Saving..." : "Save threshold"}</button>
          </div>
        </form>
      )}

      <form
        onSubmit={saveSettings}
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel"
      >
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">
              Factory costing
            </p>
            <h2 className="mt-2 text-lg font-black text-slate-900">
              Production calculation settings
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              These are required company setup values. Production costing uses
              the saved numbers automatically after you complete and save this
              section.
            </p>
          </div>
          <button
            type="button"
            onClick={loadSettings}
            disabled={status === "loading-settings"}
            className="focus-ring rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
          >
            {status === "loading-settings" ? "Loading..." : "Load settings"}
          </button>
        </div>

        {!settingsLoaded && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            No production settings are loaded yet. Fill every value and save
            this section before recording production.
          </div>
        )}

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {PRODUCTION_SETTING_FIELDS.map((field) => (
            <SettingField
              key={field.key}
              field={field}
              value={productionSettings[field.key] ?? ""}
              onChange={updateProductionSetting}
            />
          ))}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            disabled={status === "saving-settings"}
            className="focus-ring rounded-xl bg-brand-700 px-5 py-3 text-sm font-bold text-white hover:bg-brand-800 disabled:cursor-wait disabled:opacity-60"
          >
            {status === "saving-settings" ? "Saving..." : "Save settings"}
          </button>
        </div>
      </form>

      <section className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">
                Google integration
              </p>
              <h2 className="mt-2 text-lg font-black text-slate-900">
                Workbook connection
              </h2>
            </div>
            <StatusBadge
              healthy={connectionHealthy ?? configuredGoogleClient}
            >
              {connectionHealthy === true
                ? "Connected"
                : connectionHealthy === false
                  ? "Needs attention"
                  : configuredGoogleClient
                    ? "Configured"
                    : "Not configured"}
            </StatusBadge>
          </div>

          <p className="mt-3 text-sm leading-6 text-slate-500">
            Verify Google authentication, the service account, the authorized
            workbook, and the dashboard calculation endpoint in one check.
          </p>
          <button
            type="button"
            onClick={checkConnection}
            disabled={status === "checking"}
            className="focus-ring mt-5 rounded-xl bg-brand-700 px-5 py-3 text-sm font-bold text-white hover:bg-brand-800 disabled:cursor-wait disabled:opacity-60"
          >
            {status === "checking"
              ? "Checking connection..."
              : "Check and refresh connection"}
          </button>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">
                Browser storage
              </p>
              <h2 className="mt-2 text-lg font-black text-slate-900">
                Local data cache
              </h2>
            </div>
            <StatusBadge healthy={cachedRowCount > 0}>
              {cachedRowCount} cached rows
            </StatusBadge>
          </div>

          <p className="mt-3 text-sm leading-6 text-slate-500">
            Cached rows make dashboards and module screens feel faster. Clearing
            them does not delete anything from Google Sheets.
          </p>
          <button
            type="button"
            onClick={clearCache}
            className="focus-ring mt-5 rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            Clear local cache
          </button>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">
            Data overview
          </p>
          <h2 className="mt-2 text-lg font-black text-slate-900">
            Operational sheet cache
          </h2>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {cachedSheets.map(({ sheetName, rowCount }) => (
            <div
              key={sheetName}
              className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
            >
              <p className="truncate text-xs font-semibold text-slate-500">
                {sheetName.replaceAll("_", " ")}
              </p>
              <p className="mt-1 text-xl font-black text-slate-900">
                {rowCount}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
