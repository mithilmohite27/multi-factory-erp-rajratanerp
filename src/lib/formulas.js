import {
  hasCompleteProductionSettings,
  normalizeProductionSettings,
} from "./productionSettings";

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round = (value, precision = 4) => {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

export const blocksToBrass = (blocks) => round(toNumber(blocks) / 285);

export const brassToBlocks = (brass) => Math.round(toNumber(brass) * 285);

export const calculateOrderValue = (brass, ratePerBrass) =>
  round(toNumber(brass) * toNumber(ratePerBrass), 2);

export const calculateDispatchProgress = (orderedBlocks, dispatchedBlocks) => {
  const ordered = toNumber(orderedBlocks);
  if (ordered <= 0) return 0;
  return round((toNumber(dispatchedBlocks) / ordered) * 100, 2);
};

export const calculateQcLoss = (brokenBlocks, costPerBlock) =>
  round(toNumber(brokenBlocks) * toNumber(costPerBlock), 2);

export function calculateBillTotals(
  quantityBrass,
  rate,
  placeOfSupply,
  documentType,
) {
  const taxableAmount = round(toNumber(quantityBrass) * toNumber(rate), 2);
  const isTaxInvoice = documentType === "Tax Invoice";
  const isRajasthan = String(placeOfSupply || "")
    .trim()
    .toLowerCase()
    .includes("rajasthan");
  const cgst = isTaxInvoice && isRajasthan ? round(taxableAmount * 0.09, 2) : 0;
  const sgst = isTaxInvoice && isRajasthan ? round(taxableAmount * 0.09, 2) : 0;
  const igst = isTaxInvoice && !isRajasthan ? round(taxableAmount * 0.18, 2) : 0;
  const grossAmount = taxableAmount + cgst + sgst + igst;
  const finalAmount = Math.round(grossAmount);

  return Object.freeze({
    taxableAmount,
    cgst,
    sgst,
    igst,
    roundOff: round(finalAmount - grossAmount, 2),
    finalAmount,
  });
}

export function calculateProfitLoss(rows) {
  const production = rows.Production_Log || [];
  const dispatch = rows.Dispatch_Log || [];
  const qc = rows.QC_Log || [];
  const vendors = rows.Vendor_Ledger || [];
  const cashFlow = rows.CashFlow_Log || [];

  const revenue = dispatch.reduce(
    (sum, row) => sum + toNumber(row.Revenue),
    0,
  );
  const labourCost = production.reduce(
    (sum, row) => sum + toNumber(row.Labour_Cost),
    0,
  );
  const freight = dispatch.reduce(
    (sum, row) => sum + toNumber(row.Freight_Amount),
    0,
  );
  const qcLoss = qc.reduce(
    (sum, row) => sum + toNumber(row.QC_Loss ?? row.Loss_Value),
    0,
  );
  const vendorInvoices = vendors
    .filter((row) => String(row.Type).toLowerCase() === "invoice")
    .reduce((sum, row) => sum + toNumber(row.Amount), 0);
  const recordedProductionCost = production.reduce(
    (sum, row) =>
      sum +
      Math.max(
        0,
        toNumber(row.Total_Daily_Cost) - toNumber(row.Labour_Cost),
      ),
    0,
  );
  const productionMaterialCost =
    recordedProductionCost > 0 ? recordedProductionCost : vendorInvoices;
  const totalExpenses =
    productionMaterialCost + labourCost + freight + qcLoss;
  const netProfit = revenue - totalExpenses;
  const producedBlocks = production.reduce(
    (sum, row) => sum + toNumber(row.Total_Blocks),
    0,
  );
  const cashPosition = cashFlow.reduce(
    (balance, row) =>
      String(row.Type).toLowerCase() === "in"
        ? balance + toNumber(row.Amount)
        : balance - toNumber(row.Amount),
    0,
  );

  return Object.freeze({
    revenue: round(revenue, 2),
    productionCost: round(productionMaterialCost, 2),
    labourCost: round(labourCost, 2),
    freight: round(freight, 2),
    qcLoss: round(qcLoss, 2),
    totalExpenses: round(totalExpenses, 2),
    netProfit: round(netProfit, 2),
    profitMargin: revenue > 0 ? round((netProfit / revenue) * 100, 2) : 0,
    costPerBlock:
      producedBlocks > 0 ? round(totalExpenses / producedBlocks, 2) : 0,
    cashPosition: round(cashPosition, 2),
  });
}

export function calculateProductionOutputs(input, productionSettings) {
  const settings = normalizeProductionSettings(productionSettings);
  const hasSettings = hasCompleteProductionSettings(settings);
  const blocks = toNumber(input.totalBlocks);
  const mortarCement = toNumber(input.mortarCement);
  const colorCement = toNumber(input.colorCement);
  const yellowKg = toNumber(input.yellowKg);
  const redKg = toNumber(input.redKg);
  const blackKg = toNumber(input.blackKg);
  const miscExpenses =
    input.miscExpenses === "" || input.miscExpenses == null
      ? toNumber(settings.defaultMiscExpense)
      : toNumber(input.miscExpenses);

  const totalCement = mortarCement + colorCement;
  const greetTons = hasSettings
    ? ((mortarCement + colorCement) *
        settings.greetGhamela *
        settings.greetWeightPerGhamelaKg) /
      1000
    : 0;
  const powderTons = hasSettings
    ? (mortarCement *
        settings.powderGhamela *
        settings.powderWeightPerGhamelaKg) /
      1000
    : 0;
  const chemicalLitres = hasSettings
    ? mortarCement * settings.chemicalPerMortarCementBag +
      colorCement * settings.chemicalPerColorCementBag
    : 0;
  const retiGhamela = hasSettings
    ? colorCement * settings.retiGhamelaPerColorCementBag
    : 0;
  const plasticMl = hasSettings
    ? colorCement * settings.plasticMlPerColorCementBag
    : 0;
  const totalPigmentKg = yellowKg + redKg + blackKg;
  const labourCost = hasSettings ? blocks * settings.labourRate : 0;
  const totalDailyCost = hasSettings
    ? totalCement * settings.cementRate +
      greetTons * settings.greetRate +
      powderTons * settings.powderRate +
      chemicalLitres * settings.chemicalRate +
      totalPigmentKg * settings.colorRate +
      settings.plasticCost +
      retiGhamela * settings.retiRate +
      labourCost +
      miscExpenses
    : 0;

  return Object.freeze({
    blocks,
    brass: blocksToBrass(blocks),
    mortarCement,
    colorCement,
    totalCement: round(totalCement),
    greetTons: round(greetTons),
    powderTons: round(powderTons),
    chemicalLitres: round(chemicalLitres),
    yellowKg,
    redKg,
    blackKg,
    totalPigmentKg: round(totalPigmentKg),
    retiGhamela: round(retiGhamela),
    plasticMl: round(plasticMl),
    miscExpenses: round(miscExpenses, 2),
    labourCost: round(labourCost, 2),
    totalDailyCost: round(totalDailyCost, 2),
    costPerBlock: blocks > 0 ? round(totalDailyCost / blocks, 2) : 0,
  });
}
