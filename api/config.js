import { requireAdmin } from "./_lib/auth.js";
import { allowMethods, getRequestBody, sendError } from "./_lib/http.js";
import { readSheetRows, upsertConfigRows } from "./_lib/sheetsService.js";
import {
  EMPTY_PRODUCTION_SETTINGS,
  PRODUCTION_SETTING_FIELDS,
  getMissingProductionSettingKeys,
  normalizeProductionSettings,
  toConfigKey,
} from "./_lib/productionSettings.js";

function rowsToProductionSettings(rows) {
  const config = Object.fromEntries(rows.map((row) => [row.Key, row.Value]));
  return normalizeProductionSettings(
    Object.fromEntries(
      PRODUCTION_SETTING_FIELDS.map(({ key }) => [
        key,
        config[toConfigKey(key)] ?? EMPTY_PRODUCTION_SETTINGS[key],
      ]),
    ),
  );
}

export default async function handler(req, res) {
  try {
    allowMethods(req, ["GET", "PUT", "POST"]);
    await requireAdmin(req);

    if (req.method === "GET") {
      const rows = await readSheetRows("Config", { allowConfig: true });
      const productionSettings = rowsToProductionSettings(rows);
      res.status(200).json({
        ok: true,
        productionSettings,
        missingProductionSettings:
          getMissingProductionSettingKeys(productionSettings),
      });
      return;
    }

    const { productionSettings } = getRequestBody(req);
    const normalized = normalizeProductionSettings(productionSettings);
    const missingProductionSettings =
      getMissingProductionSettingKeys(normalized);

    if (missingProductionSettings.length > 0) {
      const error = new Error("Complete all production settings before saving.");
      error.statusCode = 400;
      throw error;
    }

    await upsertConfigRows(
      Object.fromEntries(
        Object.entries(normalized).map(([key, value]) => [
          toConfigKey(key),
          value,
        ]),
      ),
    );

    res.status(200).json({
      ok: true,
      productionSettings: normalized,
      missingProductionSettings: [],
    });
  } catch (error) {
    sendError(res, error);
  }
}
