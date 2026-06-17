import { google } from "googleapis";

const REQUIRED_AUTH_ENV = ["VITE_GOOGLE_CLIENT_ID"];
const REQUIRED_SHEETS_ENV = [
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_PRIVATE_KEY",
];

function hasSpreadsheetId() {
  return Boolean(
    process.env.GOOGLE_SPREADSHEET_ID ||
      process.env.GOOGLE_SPREADSHEET_ID_SHREEDEGARAY,
  );
}

function requireEnvironment(requiredKeys, label) {
  const missing = requiredKeys.filter((key) => !process.env[key]);
  if (label === "Google Sheets" && !hasSpreadsheetId()) {
    missing.unshift("GOOGLE_SPREADSHEET_ID");
  }

  if (missing.length > 0) {
    const error = new Error(
      `${label} configuration is incomplete: ${missing.join(", ")}`,
    );
    error.statusCode = 503;
    error.expose = true;
    throw error;
  }
}

export function getSpreadsheetId() {
  requireEnvironment(REQUIRED_SHEETS_ENV, "Google Sheets");
  return (
    process.env.GOOGLE_SPREADSHEET_ID ||
    process.env.GOOGLE_SPREADSHEET_ID_SHREEDEGARAY
  );
}

export function getSheetsClient() {
  requireEnvironment(REQUIRED_SHEETS_ENV, "Google Sheets");

  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

export async function verifyGoogleCredential(credential) {
  requireEnvironment(REQUIRED_AUTH_ENV, "Google OAuth");

  if (!credential) {
    const error = new Error("Google authentication is required.");
    error.statusCode = 401;
    throw error;
  }

  const client = new google.auth.OAuth2(process.env.VITE_GOOGLE_CLIENT_ID);
  const ticket = await client.verifyIdToken({
    idToken: credential,
    audience: process.env.VITE_GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();

  if (!payload?.email || !payload.email_verified) {
    const error = new Error("A verified Google email is required.");
    error.statusCode = 401;
    throw error;
  }

  return {
    email: payload.email.toLowerCase(),
    name: payload.name || payload.email,
    picture: payload.picture || "",
  };
}
