import { getSheetsClient, getSpreadsheetId } from "./google.js";
import { assertSheetName, SHEET_SCHEMAS } from "./schemas.js";

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const ensuredSheets = new Set();

function quoteSheetName(sheetName) {
  return `'${sheetName.replaceAll("'", "''")}'`;
}

function isRetryableGoogleError(error) {
  const status = error.code || error.response?.status;
  return RETRYABLE_STATUS_CODES.has(Number(status));
}

function isMissingRangeError(error) {
  const message = String(error.message || error.response?.data?.error || "");
  return /Unable to parse range|Requested entity was not found/i.test(message);
}

async function wait(ms) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withGoogleRetry(operation, { retries = 4 } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === retries || !isRetryableGoogleError(error)) {
        throw error;
      }

      const delay = 400 * 2 ** attempt + Math.floor(Math.random() * 200);
      await wait(delay);
    }
  }

  throw lastError;
}

function normalizeRow(sheetName, row) {
  const headers = SHEET_SCHEMAS[sheetName];
  if (Array.isArray(row)) {
    return headers.map((_, index) => row[index] ?? "");
  }
  if (row && typeof row === "object") {
    return headers.map((header) => row[header] ?? "");
  }

  const error = new Error("Row must be an array or object.");
  error.statusCode = 400;
  throw error;
}

export async function ensureSheetHeaders(sheetName, headers) {
  assertSheetName(sheetName, { allowConfig: true });
  const cacheKey = `${sheetName}:${headers.join("|")}`;

  if (ensuredSheets.has(cacheKey)) {
    return { sheetName, created: false, headersUpdated: false, cached: true };
  }

  if (!Array.isArray(headers) || headers.length === 0) {
    const error = new Error("Headers are required.");
    error.statusCode = 400;
    throw error;
  }

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const spreadsheet = await withGoogleRetry(() =>
    sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets.properties",
    }),
  );
  const exists = spreadsheet.data.sheets?.some(
    ({ properties }) => properties?.title === sheetName,
  );

  if (!exists) {
    await withGoogleRetry(() =>
      sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: sheetName } } }],
        },
      }),
    );
  }

  const range = `${quoteSheetName(sheetName)}!1:1`;
  const current = await withGoogleRetry(() =>
    sheets.spreadsheets.values.get({ spreadsheetId, range }),
  );
  const currentHeaders = current.data.values?.[0] || [];

  const headersMatch =
    JSON.stringify(currentHeaders) === JSON.stringify(headers);

  if (!headersMatch) {
    await withGoogleRetry(() =>
      sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${quoteSheetName(sheetName)}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [headers] },
      }),
    );
  }

  ensuredSheets.add(cacheKey);
  return { sheetName, created: !exists, headersUpdated: !headersMatch };
}

export async function ensureAllSheetHeaders() {
  const results = [];

  for (const [sheetName, headers] of Object.entries(SHEET_SCHEMAS)) {
    results.push(await ensureSheetHeaders(sheetName, headers));
  }

  return results;
}

export async function readSheetRows(sheetName, { allowConfig = false } = {}) {
  assertSheetName(sheetName, { allowConfig });
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const range = quoteSheetName(sheetName);
  let response;

  try {
    response = await withGoogleRetry(() =>
      sheets.spreadsheets.values.get({ spreadsheetId, range }),
    );
  } catch (error) {
    if (!isMissingRangeError(error)) throw error;
    await ensureSheetHeaders(sheetName, SHEET_SCHEMAS[sheetName]);
    response = await withGoogleRetry(() =>
      sheets.spreadsheets.values.get({ spreadsheetId, range }),
    );
  }
  const values = response.data.values || [];
  const headers = values[0] || SHEET_SCHEMAS[sheetName];

  return values.slice(1).map((valuesRow, index) => ({
    _rowIndex: index + 2,
    ...Object.fromEntries(
      headers.map((header, columnIndex) => [
        header,
        valuesRow[columnIndex] ?? "",
      ]),
    ),
  }));
}

function valuesToRows(sheetName, values = []) {
  const headers = values[0] || SHEET_SCHEMAS[sheetName];
  return values.slice(1).map((valuesRow, index) => ({
    _rowIndex: index + 2,
    ...Object.fromEntries(
      headers.map((header, columnIndex) => [
        header,
        valuesRow[columnIndex] ?? "",
      ]),
    ),
  }));
}

export async function readSheetRowsBatch(
  sheetNames,
  { allowConfig = false } = {},
) {
  const uniqueSheetNames = [...new Set(sheetNames)].map((sheetName) =>
    assertSheetName(sheetName, { allowConfig }),
  );

  if (uniqueSheetNames.length === 0) return {};

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const ranges = uniqueSheetNames.map((sheetName) => quoteSheetName(sheetName));
  let response;

  try {
    response = await withGoogleRetry(() =>
      sheets.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges,
      }),
    );
  } catch (error) {
    if (!isMissingRangeError(error)) throw error;
    await Promise.all(
      uniqueSheetNames.map((sheetName) =>
        ensureSheetHeaders(sheetName, SHEET_SCHEMAS[sheetName]),
      ),
    );
    response = await withGoogleRetry(() =>
      sheets.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges,
      }),
    );
  }
  const valueRanges = response.data.valueRanges || [];

  return Object.fromEntries(
    uniqueSheetNames.map((sheetName, index) => [
      sheetName,
      valuesToRows(sheetName, valueRanges[index]?.values || []),
    ]),
  );
}

export async function appendSheetRow(sheetName, row, { allowConfig = false } = {}) {
  assertSheetName(sheetName, { allowConfig });
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  await withGoogleRetry(() =>
    sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${quoteSheetName(sheetName)}!A:A`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [normalizeRow(sheetName, row)] },
    }),
  );
}

export async function updateSheetRow(
  sheetName,
  rowIndex,
  row,
  { allowConfig = false } = {},
) {
  assertSheetName(sheetName, { allowConfig });
  const normalizedIndex = Number(rowIndex);

  if (!Number.isInteger(normalizedIndex) || normalizedIndex < 2) {
    const error = new Error("A valid data row index is required.");
    error.statusCode = 400;
    throw error;
  }

  const sheets = getSheetsClient();
  await withGoogleRetry(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId: getSpreadsheetId(),
      range: `${quoteSheetName(sheetName)}!A${normalizedIndex}`,
      valueInputOption: "RAW",
      requestBody: { values: [normalizeRow(sheetName, row)] },
    }),
  );
}

export async function upsertConfigRows(entries) {
  const normalizedEntries = Object.entries(entries || {}).filter(
    ([key]) => typeof key === "string" && key.trim(),
  );

  if (normalizedEntries.length === 0) return [];

  await ensureSheetHeaders("Config", SHEET_SCHEMAS.Config);
  const rows = await readSheetRows("Config", { allowConfig: true });
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const timestamp = new Date().toISOString();
  const existingRows = new Map(rows.map((row) => [row.Key, row]));
  const updatedKeys = [];

  for (const [key, value] of normalizedEntries) {
    const row = {
      Key: key,
      Value: value,
      Updated_At: timestamp,
    };
    const existingRow = existingRows.get(key);

    if (existingRow?._rowIndex) {
      await withGoogleRetry(() =>
        sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${quoteSheetName("Config")}!A${existingRow._rowIndex}`,
          valueInputOption: "RAW",
          requestBody: { values: [normalizeRow("Config", row)] },
        }),
      );
    } else {
      await withGoogleRetry(() =>
        sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${quoteSheetName("Config")}!A:A`,
          valueInputOption: "RAW",
          insertDataOption: "INSERT_ROWS",
          requestBody: { values: [normalizeRow("Config", row)] },
        }),
      );
    }

    updatedKeys.push(key);
  }

  return updatedKeys;
}

export async function deleteSheetRow(
  sheetName,
  rowIndex,
  { allowConfig = false } = {},
) {
  assertSheetName(sheetName, { allowConfig });
  const normalizedIndex = Number(rowIndex);

  if (!Number.isInteger(normalizedIndex) || normalizedIndex < 2) {
    const error = new Error("A valid data row index is required.");
    error.statusCode = 400;
    throw error;
  }

  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const spreadsheet = await withGoogleRetry(() =>
    sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets.properties",
    }),
  );
  const sheet = spreadsheet.data.sheets?.find(
    ({ properties }) => properties?.title === sheetName,
  );

  if (!sheet?.properties?.sheetId && sheet?.properties?.sheetId !== 0) {
    const error = new Error("Sheet was not found.");
    error.statusCode = 404;
    throw error;
  }

  await withGoogleRetry(() =>
    sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: sheet.properties.sheetId,
                dimension: "ROWS",
                startIndex: normalizedIndex - 1,
                endIndex: normalizedIndex,
              },
            },
          },
        ],
      },
    }),
  );
}
