import { storage } from "./storage";

const AUTH_SESSION_KEY = "multi-factory-erp:auth-session";
const FACTORY_SELECTION_KEY = "multi-factory-erp:selected-factory";
const CACHE_KEY = "sheets-cache";
const DASHBOARD_CACHE_KEY = "dashboard-cache";
const CONFIG_CACHE_KEY = "config-cache";
const CACHE_UPDATED_EVENT = "multi-factory-erp:sheets-updated";
const CACHE_TTL_MS = 3 * 60 * 1000;
const DASHBOARD_TTL_MS = 60 * 1000;
const CONFIG_TTL_MS = 5 * 60 * 1000;
const MIN_READ_INTERVAL_MS = 350;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const ALL_FACTORY_ID = "all";
const FACTORY_AWARE_SHEETS = new Set([
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
  "Bills_Log",
  "Activity_Log",
]);

let lastReadRequestAt = 0;
const inFlightReads = new Map();
const inFlightRequests = new Map();

export const DASHBOARD_SHEETS = Object.freeze([
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
]);

function getCredential() {
  try {
    const session = JSON.parse(
      window.sessionStorage.getItem(AUTH_SESSION_KEY) || "null",
    );
    return session?.credential || "";
  } catch {
    return "";
  }
}

function sessionGet(key, fallbackValue = null) {
  try {
    const value = window.sessionStorage.getItem(key);
    return value === null ? fallbackValue : JSON.parse(value);
  } catch {
    return fallbackValue;
  }
}

function sessionSet(key, value) {
  window.sessionStorage.setItem(key, JSON.stringify(value));
}

function sessionRemove(key) {
  window.sessionStorage.removeItem(key);
}

function getSelectedFactoryId() {
  return window.sessionStorage.getItem(FACTORY_SELECTION_KEY) || ALL_FACTORY_ID;
}

function rowFactoryId(row) {
  return row?.Factory_ID || row?.factoryId || row?.FactoryId || "";
}

function filterRowsForSelectedFactory(sheetName, rows) {
  const factoryId = getSelectedFactoryId();
  if (
    !FACTORY_AWARE_SHEETS.has(sheetName) ||
    !factoryId ||
    factoryId === ALL_FACTORY_ID
  ) {
    return rows;
  }

  return rows.filter((row) => {
    const value = rowFactoryId(row);
    return !value || value === factoryId;
  });
}

function addSelectedFactoryToRow(sheetName, row) {
  const factoryId = getSelectedFactoryId();
  if (
    !FACTORY_AWARE_SHEETS.has(sheetName) ||
    !factoryId ||
    factoryId === ALL_FACTORY_ID ||
    row?.Factory_ID
  ) {
    return row;
  }

  return { Factory_ID: factoryId, ...row };
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function shouldRetry(status) {
  return RETRYABLE_STATUS_CODES.has(Number(status));
}

async function throttleReadRequests() {
  const elapsed = Date.now() - lastReadRequestAt;
  if (elapsed < MIN_READ_INTERVAL_MS) {
    await wait(MIN_READ_INTERVAL_MS - elapsed);
  }
  lastReadRequestAt = Date.now();
}

async function apiRequest(path, options = {}) {
  const credential = getCredential();

  if (!credential) {
    throw new Error("Your session has ended. Please sign in again.");
  }

  const method = options.method || "GET";
  const requestKey =
    method === "GET" ? `${method}:${path}:${options.body || ""}` : "";

  if (requestKey && inFlightRequests.has(requestKey)) {
    return inFlightRequests.get(requestKey);
  }

  const request = (async () => {
    let lastError;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(path, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${credential}`,
          ...options.headers,
        },
      });
      const payload = await response.json().catch(() => ({}));

      if (response.ok) return payload;

      const error = new Error(payload.error || "Google Sheets request failed.");
      error.status = response.status;
      lastError = error;

      if (!shouldRetry(response.status) || attempt === 3) {
        throw error;
      }

      await wait(500 * 2 ** attempt + Math.floor(Math.random() * 250));
    }

    throw lastError;
  })();

  if (requestKey) {
    inFlightRequests.set(requestKey, request);
    request.finally(() => inFlightRequests.delete(requestKey));
  }

  return request;
}

async function appendWithoutRefresh(sheetName, row) {
  return apiRequest("/api/sheets/append", {
    method: "POST",
    body: JSON.stringify({ sheetName, row: addSelectedFactoryToRow(sheetName, row) }),
  });
}

async function deleteWithoutRefresh(sheetName, rowIndex) {
  return apiRequest("/api/sheets/delete", {
    method: "DELETE",
    body: JSON.stringify({ sheetName, rowIndex }),
  });
}

function writeCache(sheetName, rows) {
  const cache = sessionGet(CACHE_KEY, {});
  const nextCache = {
    ...cache,
    [sheetName]: {
      rows,
      updatedAt: Date.now(),
    },
  };
  sessionSet(CACHE_KEY, nextCache);
  window.dispatchEvent(
    new CustomEvent(CACHE_UPDATED_EVENT, {
      detail: { sheetName, rows },
    }),
  );
  return rows;
}

export function getCachedRows(sheetName) {
  return filterRowsForSelectedFactory(
    sheetName,
    sessionGet(CACHE_KEY, {})?.[sheetName]?.rows || [],
  );
}

function getCachedSheetEntry(sheetName) {
  return sessionGet(CACHE_KEY, {})?.[sheetName] || null;
}

function isFreshSheet(sheetName, maxAgeMs = CACHE_TTL_MS) {
  const entry = getCachedSheetEntry(sheetName);
  return entry && Date.now() - Number(entry.updatedAt || 0) < maxAgeMs;
}

function invalidateSheets(sheetNames) {
  const cache = sessionGet(CACHE_KEY, {});
  sheetNames.forEach((sheetName) => {
    delete cache[sheetName];
  });
  sessionSet(CACHE_KEY, cache);
}

function invalidateDashboard() {
  sessionRemove(DASHBOARD_CACHE_KEY);
}

export function getCachedSheetData(sheetNames = DASHBOARD_SHEETS) {
  return Object.fromEntries(
    sheetNames.map((sheetName) => [sheetName, getCachedRows(sheetName)]),
  );
}

export async function readRows(sheetName, options = {}) {
  const data = await syncFromSheets([sheetName], options);
  return data[sheetName] || [];
}

export async function appendRow(sheetName, row) {
  await appendWithoutRefresh(sheetName, row);
  return refreshAfterMutation(sheetName);
}

export async function appendRows(operations, refreshSheetNames = []) {
  for (const { sheetName, row } of operations) {
    await appendWithoutRefresh(sheetName, row);
  }

  const sheetNames = [
    ...new Set([
      ...operations.map(({ sheetName }) => sheetName),
      ...refreshSheetNames,
    ]),
  ];
  invalidateSheets(sheetNames);
  invalidateDashboard();
  return syncFromSheets(sheetNames, { force: true });
}

export async function updateRow(sheetName, rowIndex, row) {
  await apiRequest("/api/sheets/update", {
    method: "PUT",
    body: JSON.stringify({ sheetName, rowIndex, row }),
  });
  return refreshAfterMutation(sheetName);
}

export async function deleteRow(sheetName, rowIndex) {
  await deleteWithoutRefresh(sheetName, rowIndex);
  return refreshAfterMutation(sheetName);
}

export async function deleteRows(operations, refreshSheetNames = []) {
  const grouped = operations.reduce((result, operation) => {
    result[operation.sheetName] ||= [];
    result[operation.sheetName].push(operation);
    return result;
  }, {});

  for (const [sheetName, sheetOperations] of Object.entries(grouped)) {
    const rowIndices = sheetOperations
      .map(({ rowIndex }) => Number(rowIndex))
      .sort((a, b) => b - a);
    for (const rowIndex of rowIndices) {
      await deleteWithoutRefresh(sheetName, rowIndex);
    }
  }

  const sheetNames = [
    ...new Set([
      ...operations.map(({ sheetName }) => sheetName),
      ...refreshSheetNames,
    ]),
  ];
  invalidateSheets(sheetNames);
  invalidateDashboard();
  return syncFromSheets(sheetNames, { force: true });
}

export async function ensureSheetHeaders(sheetName, headers) {
  return apiRequest("/api/sheets/ensureHeaders", {
    method: "POST",
    body: JSON.stringify({ sheetName, headers }),
  });
}

export async function syncFromSheets(sheetNames, options = {}) {
  const uniqueSheetNames = [...new Set(sheetNames)];
  const { force = false, maxAgeMs = CACHE_TTL_MS } = options;
  const cachedData = Object.fromEntries(
    uniqueSheetNames.map((sheetName) => [sheetName, getCachedRows(sheetName)]),
  );
  const staleSheetNames = force
    ? uniqueSheetNames
    : uniqueSheetNames.filter((sheetName) => !isFreshSheet(sheetName, maxAgeMs));

  if (staleSheetNames.length === 0) return cachedData;

  const readKey = staleSheetNames.slice().sort().join("|");
  if (!inFlightReads.has(readKey)) {
    const readPromise = (async () => {
      await throttleReadRequests();
      const payload = await apiRequest("/api/sheets/batchRead", {
        method: "POST",
        body: JSON.stringify({ sheetNames: staleSheetNames }),
      });
      Object.entries(payload.data || {}).forEach(([sheetName, rows]) => {
        writeCache(sheetName, rows || []);
      });
      return Object.fromEntries(
        Object.entries(payload.data || {}).map(([sheetName, rows]) => [
          sheetName,
          filterRowsForSelectedFactory(sheetName, rows || []),
        ]),
      );
    })();

    inFlightReads.set(readKey, readPromise);
    readPromise.finally(() => inFlightReads.delete(readKey));
  }

  const freshData = await inFlightReads.get(readKey);
  return Object.fromEntries(
    uniqueSheetNames.map((sheetName) => [
      sheetName,
      freshData[sheetName] || getCachedRows(sheetName),
    ]),
  );
}

export async function getDashboardSnapshot({ force = false } = {}) {
  const cached = getCachedDashboardSnapshot();
  if (
    !force &&
    cached &&
    Date.now() - new Date(cached.generatedAt || 0).getTime() < DASHBOARD_TTL_MS
  ) {
    return cached;
  }

  const payload = await apiRequest("/api/dashboard");
  sessionSet(DASHBOARD_CACHE_KEY, payload.dashboard);
  return payload.dashboard;
}

export async function getDashboardSnapshotForFactory(
  factoryId,
  { force = false, period = "today" } = {},
) {
  const cacheKey = `${DASHBOARD_CACHE_KEY}:${factoryId || "all"}:${period}`;
  const cached = sessionGet(cacheKey, null);
  if (
    !force &&
    cached &&
    Date.now() - new Date(cached.generatedAt || 0).getTime() < DASHBOARD_TTL_MS
  ) {
    return cached;
  }

  const query = new URLSearchParams({
    factoryId: factoryId || "all",
    period,
  }).toString();
  const payload = await apiRequest(`/api/dashboard?${query}`);
  sessionSet(cacheKey, payload.dashboard);
  return payload.dashboard;
}

export async function getConfig({ force = false } = {}) {
  const cached = getCachedConfig();
  if (
    !force &&
    cached?.cachedAt &&
    Date.now() - cached.cachedAt < CONFIG_TTL_MS
  ) {
    return cached;
  }

  const payload = await apiRequest("/api/config");
  sessionSet(CONFIG_CACHE_KEY, { ...payload, cachedAt: Date.now() });
  return payload;
}

export function getCachedConfig() {
  return sessionGet(CONFIG_CACHE_KEY, null);
}

export async function saveProductionSettings(productionSettings) {
  const payload = await apiRequest("/api/config", {
    method: "PUT",
    body: JSON.stringify({ productionSettings }),
  });
  sessionSet(CONFIG_CACHE_KEY, { ...payload, cachedAt: Date.now() });
  return payload.productionSettings;
}

export async function getUsers() {
  const payload = await apiRequest("/api/users");
  return payload.users || [];
}

export async function saveUserAccess(userAccess) {
  const payload = await apiRequest("/api/users", {
    method: "POST",
    body: JSON.stringify(userAccess),
  });
  return payload.users || [];
}

async function refreshAfterMutation(sheetName) {
  invalidateSheets([sheetName]);
  invalidateDashboard();
  return readRows(sheetName, { force: true });
}

export function getCachedDashboardSnapshot() {
  return sessionGet(DASHBOARD_CACHE_KEY, null);
}

export async function refreshAllCalculations({ force = true } = {}) {
  return getDashboardSnapshot({ force });
}

export async function refreshFactoryCalculations(
  factoryId,
  { force = true, period = "today" } = {},
) {
  return getDashboardSnapshotForFactory(factoryId, { force, period });
}

export function clearLocalCache() {
  storage.clearAll();
  sessionRemove(CACHE_KEY);
  sessionRemove(DASHBOARD_CACHE_KEY);
  sessionRemove(CONFIG_CACHE_KEY);
}

export { AUTH_SESSION_KEY, CACHE_UPDATED_EVENT };
