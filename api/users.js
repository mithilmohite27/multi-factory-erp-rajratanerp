import { randomUUID } from "node:crypto";
import { requireSuperAdmin } from "./_lib/auth.js";
import { allowMethods, getRequestBody, sendError } from "./_lib/http.js";
import { SHEET_SCHEMAS } from "./_lib/schemas.js";
import {
  appendSheetRow,
  ensureSheetHeaders,
  readSheetRows,
  updateSheetRow,
} from "./_lib/sheetsService.js";

const VALID_ROLES = new Set([
  "Super Admin",
  "Factory Admin",
  "Supervisor",
  "Operator",
]);

const parseList = (value) =>
  Array.isArray(value)
    ? value.filter(Boolean)
    : String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

function normalizeUser(input = {}, existing = {}) {
  const email = String(input.Email || input.email || existing.Email || "")
    .trim()
    .toLowerCase();
  const name = String(input.Name || input.name || existing.Name || "").trim();
  const role = String(input.Role || input.role || existing.Role || "Operator").trim();
  const factoryIds = parseList(input.Factory_IDs ?? input.factoryIds ?? existing.Factory_IDs);
  const permissions = parseList(
    input.Permissions ?? input.permissions ?? existing.Permissions,
  );
  const status = String(input.Status || input.status || existing.Status || "Active").trim();

  if (!email || !email.includes("@")) {
    const error = new Error("Enter a valid user email.");
    error.statusCode = 400;
    throw error;
  }

  if (!VALID_ROLES.has(role)) {
    const error = new Error("Select a valid user role.");
    error.statusCode = 400;
    throw error;
  }

  if (role !== "Super Admin" && factoryIds.length === 0) {
    const error = new Error("Assign at least one factory for this role.");
    error.statusCode = 400;
    throw error;
  }

  const timestamp = new Date().toISOString();
  return {
    User_ID: existing.User_ID || input.User_ID || `USR-${randomUUID()}`,
    Email: email,
    Name: name || email,
    Role: role,
    Factory_IDs: role === "Super Admin" ? "" : factoryIds.join(","),
    Permissions: permissions.join(","),
    Status: status || "Active",
    Created_At: existing.Created_At || timestamp,
    Updated_At: timestamp,
  };
}

async function readUsers() {
  await ensureSheetHeaders("Users", SHEET_SCHEMAS.Users);
  return readSheetRows("Users", { allowConfig: true });
}

export default async function handler(req, res) {
  try {
    allowMethods(req, ["GET", "POST", "PUT"]);
    await requireSuperAdmin(req);

    if (req.method === "GET") {
      res.status(200).json({ ok: true, users: await readUsers() });
      return;
    }

    const body = getRequestBody(req);
    const users = await readUsers();
    const requestedEmail = String(body.Email || body.email || "").trim().toLowerCase();
    const existing = users.find(
      (row) =>
        row.User_ID === body.User_ID ||
        String(row.Email || "").trim().toLowerCase() === requestedEmail,
    );
    const row = normalizeUser(body, existing);

    if (existing?._rowIndex) {
      await updateSheetRow("Users", existing._rowIndex, row, { allowConfig: true });
    } else {
      await appendSheetRow("Users", row, { allowConfig: true });
    }

    res.status(200).json({ ok: true, user: row, users: await readUsers() });
  } catch (error) {
    sendError(res, error);
  }
}
