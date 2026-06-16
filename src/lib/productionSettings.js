export const PRODUCTION_SETTING_FIELDS = Object.freeze([
  {
    key: "greetGhamela",
    label: "Greet Ghamela",
  },
  {
    key: "greetWeightPerGhamelaKg",
    label: "Greet Weight per Ghamela kg",
  },
  {
    key: "powderGhamela",
    label: "Powder Ghamela",
  },
  {
    key: "powderWeightPerGhamelaKg",
    label: "Powder Weight per Ghamela kg",
  },
  {
    key: "chemicalPerMortarCementBag",
    label: "Chemical per Mortar Cement bag (L)",
  },
  {
    key: "chemicalPerColorCementBag",
    label: "Chemical per Color Cement bag (L)",
  },
  {
    key: "yellowColorSplitRatio",
    label: "Yellow Color Split Ratio (0.5 = 50%)",
  },
  {
    key: "redColorSplitRatio",
    label: "Red Color Split Ratio (0.5 = 50%)",
  },
  {
    key: "retiGhamelaPerColorCementBag",
    label: "Reti Ghamela per Color Cement bag",
  },
  {
    key: "plasticMlPerColorCementBag",
    label: "Plastic ml per Color Cement bag",
  },
  {
    key: "cementRate",
    label: "Cement Rate (Rs/bag)",
  },
  {
    key: "greetRate",
    label: "Greet Rate (Rs/ton)",
  },
  {
    key: "powderRate",
    label: "Powder Rate (Rs/ton)",
  },
  {
    key: "chemicalRate",
    label: "Chemical Rate (Rs/litre)",
  },
  {
    key: "colorRate",
    label: "Color Rate (Rs/kg)",
  },
  {
    key: "plasticCost",
    label: "Plastic Cost (Rs flat)",
  },
  {
    key: "retiRate",
    label: "Reti Rate (Rs/ghamela)",
  },
  {
    key: "labourRate",
    label: "Labour Rate (Rs/block)",
  },
  {
    key: "defaultMiscExpense",
    label: "Default Miscellaneous Expense (Rs)",
  },
]);

export const PRODUCTION_SETTINGS_PREFIX = "PRODUCTION_SETTING_";

export const EMPTY_PRODUCTION_SETTINGS = Object.freeze(
  Object.fromEntries(PRODUCTION_SETTING_FIELDS.map(({ key }) => [key, ""])),
);

export const toConfigKey = (settingKey) =>
  `${PRODUCTION_SETTINGS_PREFIX}${settingKey}`;

export function normalizeProductionSettings(values = {}) {
  return Object.fromEntries(
    PRODUCTION_SETTING_FIELDS.map(({ key }) => {
      const value = values[key];
      if (value === "" || value == null) return [key, ""];
      const parsed = Number(values[key]);
      return [key, Number.isFinite(parsed) ? parsed : ""];
    }),
  );
}

export function getMissingProductionSettingKeys(values = {}) {
  return PRODUCTION_SETTING_FIELDS.filter(({ key }) => {
    const parsed = Number(values[key]);
    return values[key] === "" || values[key] == null || !Number.isFinite(parsed);
  }).map(({ key }) => key);
}

export function hasCompleteProductionSettings(values = {}) {
  return getMissingProductionSettingKeys(values).length === 0;
}
