import { getBearerToken } from "./http.js";
import { verifyGoogleCredential } from "./google.js";
import {
  ensureSheetHeaders,
  readSheetRows,
} from "./sheetsService.js";
import { SHEET_SCHEMAS } from "./schemas.js";

const ADMIN_KEY = "ADMIN_EMAIL";
const ADMIN_CACHE_TTL_MS = 5 * 60 * 1000;
let adminCache = null;

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getEnvAdminEmails() {
  return parseList(
    [process.env.ADMIN_EMAILS, process.env.ADMIN_EMAIL].filter(Boolean).join(","),
  ).map((email) => email.toLowerCase());
}

function isEnvAdminEmail(email) {
  return getEnvAdminEmails().includes(String(email || "").toLowerCase());
}

function superAdminUser(user) {
  return { ...user, role: "Super Admin", factoryIds: [], permissions: [] };
}

function findAdminRow(rows) {
  return rows.find((row) => row.Key === ADMIN_KEY);
}

async function getAdminEmail({ refresh = false } = {}) {
  if (
    !refresh &&
    adminCache &&
    Date.now() - adminCache.loadedAt < ADMIN_CACHE_TTL_MS
  ) {
    return adminCache.email;
  }

  const configRows = await readSheetRows("Config", { allowConfig: true });
  const adminEmail = String(findAdminRow(configRows)?.Value || "").toLowerCase();
  adminCache = { email: adminEmail, loadedAt: Date.now() };
  return adminEmail;
}

export async function registerOrAuthorizeAdmin(credential) {
  const user = await verifyGoogleCredential(credential);

  if (isEnvAdminEmail(user.email)) {
    return superAdminUser(user);
  }

  await ensureSheetHeaders("Config", SHEET_SCHEMAS.Config);
  await ensureSheetHeaders("Users", SHEET_SCHEMAS.Users);

  const configRows = await readSheetRows("Config", { allowConfig: true });
  const adminRow = findAdminRow(configRows);

  if (!adminRow) {
    const { getSheetsClient, getSpreadsheetId } = await import("./google.js");
    const sheets = getSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: getSpreadsheetId(),
      range: "'Config'!A:A",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [[ADMIN_KEY, user.email, new Date().toISOString()]],
      },
    });
    adminCache = { email: user.email, loadedAt: Date.now() };
  } else if (String(adminRow.Value).toLowerCase() === user.email) {
    return superAdminUser(user);
  }

  const userRows = await readSheetRows("Users", { allowConfig: true });
  const accessRow = userRows.find(
    (row) =>
      String(row.Email || "").trim().toLowerCase() === user.email &&
      String(row.Status || "Active").trim().toLowerCase() !== "inactive",
  );

  if (!accessRow) {
    const error = new Error(
      "Access denied. This Google account is not authorized for this ERP.",
    );
    error.statusCode = 403;
    throw error;
  }

  return {
    ...user,
    name: accessRow.Name || user.name,
    role: accessRow.Role || "Operator",
    factoryIds: parseList(accessRow.Factory_IDs),
    permissions: parseList(accessRow.Permissions),
  };
}

export async function requireAdmin(req) {
  const user = await verifyGoogleCredential(getBearerToken(req));

  if (isEnvAdminEmail(user.email)) {
    return superAdminUser(user);
  }

  const adminEmail = await getAdminEmail();

  if (adminEmail && adminEmail === user.email) {
    return superAdminUser(user);
  }

  await ensureSheetHeaders("Users", SHEET_SCHEMAS.Users);
  const rows = await readSheetRows("Users", { allowConfig: true });
  const accessRow = rows.find(
    (row) =>
      String(row.Email || "").trim().toLowerCase() === user.email &&
      String(row.Status || "Active").trim().toLowerCase() !== "inactive",
  );

  if (!accessRow) {
    const error = new Error("Access denied.");
    error.statusCode = 403;
    throw error;
  }

  return {
    ...user,
    name: accessRow.Name || user.name,
    role: accessRow.Role || "Operator",
    factoryIds: parseList(accessRow.Factory_IDs),
    permissions: parseList(accessRow.Permissions),
  };
}

export async function requireSuperAdmin(req) {
  const user = await requireAdmin(req);

  if (String(user.role || "").trim().toLowerCase() !== "super admin") {
    const error = new Error("Only Super Admin can manage user access.");
    error.statusCode = 403;
    throw error;
  }

  return user;
}
