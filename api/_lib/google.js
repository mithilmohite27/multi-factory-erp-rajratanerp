import { google } from "googleapis";

const REQUIRED_ENV = [
  "VITE_GOOGLE_CLIENT_ID",
  "GOOGLE_SPREADSHEET_ID_SHREEDEGARAY",
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_PRIVATE_KEY",
];

function requireEnvironment() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    const error = new Error(
      `Server configuration is incomplete: ${missing.join(", ")}`,
    );
    error.statusCode = 500;
    throw error;
  }
}

export function getSpreadsheetId() {
  requireEnvironment();
  return process.env.GOOGLE_SPREADSHEET_ID_SHREEDEGARAY;
}

export function getSheetsClient() {
  requireEnvironment();

  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

export async function verifyGoogleCredential(credential) {
  requireEnvironment();

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
