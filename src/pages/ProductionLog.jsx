import { useCallback, useEffect, useMemo, useState } from "react";
import { BLOCK_COLORS, PRODUCT_SIZES } from "../lib/constants";
import { blocksToBrass, calculateProductionOutputs } from "../lib/formulas";
import {
  appendRows,
  deleteRows,
  getCachedConfig,
  getConfig,
  syncFromSheets,
} from "../lib/sheets";
import {
  EMPTY_PRODUCTION_SETTINGS,
  hasCompleteProductionSettings,
} from "../lib/productionSettings";
import { useAuth } from "../lib/authContext";
import {
  ALL_FACTORY_ID,
  factoryLabel,
  filterRowsByFactory,
  useFactory,
  withFactoryFields,
} from "../lib/factories";
import { useSessionFormState } from "../lib/useSessionFormState";

const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const emptyForm = () => ({
  date: today(),
  productSize: PRODUCT_SIZES[0],
  mortarCement: "",
  colorCement: "",
  totalBlocks: "",
  Red: "",
  Yellow: "",
  Black: "",
  White: "",
  Grey: "",
  Custom: "",
  yellowKg: "",
  redKg: "",
  blackKg: "",
  miscExpenses: "",
  notes: "",
});

const numberValue = (value) => Number(value) || 0;
const formatNumber = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
});
const formatCurrency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

function Field({ label, name, value, onChange, type = "number", children, ...props }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children ? (
        <select
          name={name}
          value={value}
          onChange={onChange}
          className="focus-ring w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900"
          {...props}
        >
          {children}
        </select>
      ) : (
        <input
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          min={type === "number" ? "0" : undefined}
          step={type === "number" ? "any" : undefined}
          className="focus-ring w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 placeholder:text-slate-300"
          {...props}
        />
      )}
    </label>
  );
}

export default function ProductionLog() {
  const { user, logout } = useAuth();
  const { selectedFactoryId } = useFactory();
  const [form, setForm, resetForm] = useSessionFormState(
    "production-log",
    emptyForm,
  );
  const [productionRows, setProductionRows] = useState([]);
  const [variantRows, setVariantRows] = useState([]);
  const [productionSettings, setProductionSettings] = useState(
    () =>
      getCachedConfig()?.productionSettings || EMPTY_PRODUCTION_SETTINGS,
  );
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");

  const loadData = useCallback(async () => {
    setStatus("loading");
    try {
      const data = await syncFromSheets([
        "Production_Log",
        "Production_Variants",
      ]);
      getConfig()
        .then((config) =>
          setProductionSettings(
            config.productionSettings || EMPTY_PRODUCTION_SETTINGS,
          ),
        )
        .catch(() => {});
      setProductionRows(filterRowsByFactory(data.Production_Log, selectedFactoryId));
      setVariantRows(filterRowsByFactory(data.Production_Variants, selectedFactoryId));
      setStatus("ready");
    } catch (error) {
      if ([401, 403].includes(error.status)) logout();
      else {
        setMessage(error.message);
        setStatus("error");
      }
    }
  }, [logout, selectedFactoryId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const colorTotal = useMemo(
    () => BLOCK_COLORS.reduce((sum, color) => sum + numberValue(form[color]), 0),
    [form],
  );
  const outputs = useMemo(
    () => calculateProductionOutputs(form, productionSettings),
    [form, productionSettings],
  );
  const settingsReady = hasCompleteProductionSettings(productionSettings);

  const handleChange = ({ target }) => {
    setForm((current) => ({ ...current, [target.name]: target.value }));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setMessage("");

    if (!form.date || outputs.blocks <= 0) {
      setMessage("Enter a date and total blocks greater than zero.");
      return;
    }
    if (selectedFactoryId === ALL_FACTORY_ID) {
      setMessage("Select a specific factory before saving production.");
      return;
    }
    if (!settingsReady) {
      setMessage("Complete Production calculation settings before saving.");
      return;
    }
    if (colorTotal !== outputs.blocks) {
      setMessage("The color-wise block total must equal total blocks.");
      return;
    }

    setStatus("saving");
    const productionId = `PRD-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    const operations = [
      {
        sheetName: "Production_Log",
        row: withFactoryFields({
          Production_ID: productionId,
          Date: form.date,
          Product_Size: form.productSize,
          Total_Blocks: outputs.blocks,
          Brass: outputs.brass,
          Mortar_Cement: outputs.mortarCement,
          Color_Cement: outputs.colorCement,
          Total_Cement: outputs.totalCement,
          Greet_Tons: outputs.greetTons,
          Powder_Tons: outputs.powderTons,
          Chemical_Litres: outputs.chemicalLitres,
          Yellow_Kg: outputs.yellowKg,
          Red_Kg: outputs.redKg,
          Black_Kg: outputs.blackKg,
          Total_Pigment_Kg: outputs.totalPigmentKg,
          Reti_Ghamela: outputs.retiGhamela,
          Plastic_Ml: outputs.plasticMl,
          Misc_Expenses: outputs.miscExpenses,
          Labour_Cost: outputs.labourCost,
          Total_Daily_Cost: outputs.totalDailyCost,
          Cost_Per_Block: outputs.costPerBlock,
          Notes: form.notes.trim(),
          Created_At: timestamp,
          Updated_At: timestamp,
        }, selectedFactoryId),
      },
      ...BLOCK_COLORS.filter((color) => numberValue(form[color]) > 0).map(
        (color) => ({
          sheetName: "Production_Variants",
          row: withFactoryFields({
            Variant_ID: `VAR-${crypto.randomUUID()}`,
            Production_ID: productionId,
            Date: form.date,
            Product_Size: form.productSize,
            Color: color,
            Blocks: numberValue(form[color]),
            Brass: blocksToBrass(form[color]),
            Cost_Per_Block: outputs.costPerBlock,
            Created_At: timestamp,
          }, selectedFactoryId),
        }),
      ),
      {
        sheetName: "Activity_Log",
        row: withFactoryFields({
          Timestamp: timestamp,
          Module: "Production",
          Action: "Created",
          Description: `${outputs.blocks} ${form.productSize} blocks recorded for ${factoryLabel(selectedFactoryId)} on ${form.date}`,
          User_Email: user.email,
        }, selectedFactoryId),
      },
    ];

    try {
      const data = await appendRows(operations, [
        "Production_Log",
        "Production_Variants",
      ]);
      setProductionRows(filterRowsByFactory(data.Production_Log, selectedFactoryId));
      setVariantRows(filterRowsByFactory(data.Production_Variants, selectedFactoryId));
      resetForm();
      setMessage("Production saved successfully.");
      setStatus("ready");
    } catch (error) {
      if ([401, 403].includes(error.status)) logout();
      else {
        setMessage(error.message);
        setStatus("error");
      }
    }
  };

  const handleDelete = async (production) => {
    const productionId = production.Production_ID;
    if (!window.confirm("Delete this production entry and its color stock rows?")) {
      return;
    }

    setStatus("saving");
    setMessage("");
    const relatedVariants = productionId
      ? variantRows.filter((row) => row.Production_ID === productionId)
      : [];

    try {
      const data = await deleteRows(
        [
          ...relatedVariants.map((row) => ({
            sheetName: "Production_Variants",
            rowIndex: row._rowIndex,
          })),
          {
            sheetName: "Production_Log",
            rowIndex: production._rowIndex,
          },
        ],
        [
          "Production_Log",
          "Production_Variants",
          "Opening_Material_Stock",
          "Vendor_Ledger",
          "External_Material_Usage",
          "Opening_Stock",
          "Dispatch_Log",
          "QC_Log",
        ],
      );
      await appendRows([
        {
          sheetName: "Activity_Log",
          row: withFactoryFields({
            Timestamp: new Date().toISOString(),
            Module: "Production",
            Action: "Deleted",
            Description: `Production entry removed for ${production.Date}`,
            User_Email: user.email,
          }, selectedFactoryId === ALL_FACTORY_ID ? production.Factory_ID : selectedFactoryId),
        },
      ]);
      setProductionRows(filterRowsByFactory(data.Production_Log, selectedFactoryId));
      setVariantRows(filterRowsByFactory(data.Production_Variants, selectedFactoryId));
      setMessage("Production and related color rows deleted.");
      setStatus("ready");
    } catch (error) {
      if ([401, 403].includes(error.status)) logout();
      else {
        setMessage(error.message);
        setStatus("error");
      }
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-brand-900 px-6 py-7 text-white shadow-panel sm:px-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-sand-300">
          {factoryLabel(selectedFactoryId)}
        </p>
        <h1 className="mt-2 text-2xl font-black sm:text-3xl">Production Log</h1>
        <p className="mt-2 text-sm text-white/55">
          Record daily output and final costing for finished blocks.
        </p>
      </section>

      {message && (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-panel">
          {message}
        </div>
      )}

      {!settingsReady && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-panel">
          Production costing settings are not complete. Open Settings, fill all
          production calculation values, and save them before entering
          production.
        </div>
      )}

      <form
        onSubmit={handleSave}
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel sm:p-7"
      >
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">
              Daily entry
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">
              Production details
            </h2>
          </div>
          <p className="text-sm text-slate-500">
            Color total: <strong className="text-slate-900">{colorTotal}</strong>
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field
            label="Date"
            name="date"
            type="date"
            value={form.date}
            onChange={handleChange}
            required
          />
          <Field
            label="Product size"
            name="productSize"
            type="text"
            value={form.productSize}
            onChange={handleChange}
            required
          >
            {PRODUCT_SIZES.map((size) => (
              <option key={size}>{size}</option>
            ))}
          </Field>
          <Field
            label="Mortar cement"
            name="mortarCement"
            value={form.mortarCement}
            onChange={handleChange}
            required
          />
          <Field
            label="Color cement"
            name="colorCement"
            value={form.colorCement}
            onChange={handleChange}
            required
          />
          <Field
            label="Total blocks"
            name="totalBlocks"
            value={form.totalBlocks}
            onChange={handleChange}
            required
          />
        </div>

        <div className="my-6 border-t border-slate-100 pt-6">
          <h3 className="mb-4 text-sm font-bold text-slate-800">
            Color-wise finished blocks
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {BLOCK_COLORS.map((color) => (
              <Field
                key={color}
                label={color}
                name={color}
                value={form[color]}
                onChange={handleChange}
              />
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field
            label="Yellow kg"
            name="yellowKg"
            value={form.yellowKg}
            onChange={handleChange}
          />
          <Field
            label="Red kg"
            name="redKg"
            value={form.redKg}
            onChange={handleChange}
          />
          <Field
            label="Black kg"
            name="blackKg"
            value={form.blackKg}
            onChange={handleChange}
          />
          <Field
            label="Misc expenses"
            name="miscExpenses"
            value={form.miscExpenses}
            onChange={handleChange}
            placeholder="Default applies when empty"
          />
        </div>

        <label className="mt-4 block">
          <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">
            Notes
          </span>
          <textarea
            name="notes"
            value={form.notes}
            onChange={handleChange}
            rows="3"
            className="focus-ring w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm"
          />
        </label>

        <div className="mt-6 flex flex-col gap-4 rounded-2xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-x-7 gap-y-2 text-sm">
            <span className="text-slate-500">
              Brass:{" "}
              <strong className="text-slate-900">
                {formatNumber.format(outputs.brass)}
              </strong>
            </span>
            <span className="text-slate-500">
              Final daily cost:{" "}
              <strong className="text-slate-900">
                {formatCurrency.format(outputs.totalDailyCost)}
              </strong>
            </span>
            <span className="text-slate-500">
              Final cost / block:{" "}
              <strong className="text-slate-900">
                {formatCurrency.format(outputs.costPerBlock)}
              </strong>
            </span>
          </div>
          <button
            type="submit"
            disabled={status === "saving"}
            aria-disabled={!settingsReady}
            className="focus-ring rounded-xl bg-brand-700 px-5 py-3 text-sm font-bold text-white hover:bg-brand-800 disabled:opacity-60"
          >
            {status === "saving" ? "Saving..." : "Save production"}
          </button>
        </div>
      </form>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-panel">
        <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
          <h2 className="text-lg font-bold text-slate-900">Recent production</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Factory</th>
                <th className="px-5 py-3">Product</th>
                <th className="px-5 py-3">Blocks</th>
                <th className="px-5 py-3">Brass</th>
                <th className="px-5 py-3">Final cost</th>
                <th className="px-5 py-3">Cost / block</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {productionRows
                .slice()
                .reverse()
                .map((row) => (
                  <tr key={`${row.Production_ID}-${row._rowIndex}`}>
                    <td className="px-5 py-4 font-medium text-slate-800">
                      {row.Date}
                    </td>
                    <td className="px-5 py-4">{factoryLabel(row.Factory_ID)}</td>
                    <td className="px-5 py-4">{row.Product_Size || "40mm"}</td>
                    <td className="px-5 py-4">{row.Total_Blocks}</td>
                    <td className="px-5 py-4">
                      {formatNumber.format(numberValue(row.Brass))}
                    </td>
                    <td className="px-5 py-4">
                      {formatCurrency.format(numberValue(row.Total_Daily_Cost))}
                    </td>
                    <td className="px-5 py-4">
                      {formatCurrency.format(numberValue(row.Cost_Per_Block))}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(row)}
                        className="focus-ring rounded-lg px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              {productionRows.length === 0 && (
                <tr>
                  <td colSpan="8" className="px-5 py-10 text-center text-slate-500">
                    No production entries yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
