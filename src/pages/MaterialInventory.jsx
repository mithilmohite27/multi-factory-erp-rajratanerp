import { useCallback, useEffect, useMemo, useState } from "react";
import { MATERIALS } from "../lib/constants";
import { appendRows, deleteRows, syncFromSheets } from "../lib/sheets";
import { useAuth } from "../lib/authContext";
import { useSessionFormState } from "../lib/useSessionFormState";

const MATERIAL_SHEETS = [
  "Opening_Material_Stock",
  "Vendor_Ledger",
  "Production_Log",
  "External_Material_Usage",
];

const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const emptyForm = () => ({
  date: today(),
  material: MATERIALS[0].name,
  quantity: "",
  reference: "",
  notes: "",
});

const numberValue = (value) => {
  const result = Number(String(value ?? "").replaceAll(",", ""));
  return Number.isFinite(result) ? result : 0;
};
const normalized = (value) => String(value || "").trim().toLowerCase();
const formatNumber = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 4,
});

const PRODUCTION_FIELDS = Object.freeze({
  "Cement bags": "Total_Cement",
  "Greet tons": "Greet_Tons",
  "Powder tons": "Powder_Tons",
  "Chemical litres": "Chemical_Litres",
  "Yellow kg": "Yellow_Kg",
  "Red kg": "Red_Kg",
  "Black kg": "Black_Kg",
  "Reti ghamela": "Reti_Ghamela",
  "Plastic ml": "Plastic_Ml",
});

function sumMatching(rows, materialName, quantityField = "Quantity") {
  return rows.reduce((sum, row) => {
    const rowMaterial = row.Material || row.Description;
    const isInvoice =
      !row.Type || normalized(row.Type) === "invoice";
    return normalized(rowMaterial) === normalized(materialName) && isInvoice
      ? sum + numberValue(row[quantityField])
      : sum;
  }, 0);
}

export default function MaterialInventory() {
  const { user, logout } = useAuth();
  const [data, setData] = useState(
    Object.fromEntries(MATERIAL_SHEETS.map((name) => [name, []])),
  );
  const [form, setForm, resetForm] = useSessionFormState(
    "material-inventory",
    emptyForm,
  );
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");

  const loadData = useCallback(async () => {
    setStatus("loading");
    try {
      setData(await syncFromSheets(MATERIAL_SHEETS));
      setStatus("ready");
    } catch (error) {
      if ([401, 403].includes(error.status)) logout();
      else {
        setMessage(error.message);
        setStatus("error");
      }
    }
  }, [logout]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const inventory = useMemo(
    () =>
      MATERIALS.map((material) => {
        const opening = sumMatching(
          data.Opening_Material_Stock,
          material.name,
        );
        const purchases = sumMatching(data.Vendor_Ledger, material.name);
        const usedInProduction = data.Production_Log.reduce(
          (sum, row) =>
            sum + numberValue(row[PRODUCTION_FIELDS[material.name]]),
          0,
        );
        const externalUsage = sumMatching(
          data.External_Material_Usage,
          material.name,
        );

        return {
          ...material,
          opening,
          purchases,
          usedInProduction,
          externalUsage,
          stock: opening + purchases - usedInProduction - externalUsage,
        };
      }),
    [data],
  );

  const handleChange = ({ target }) => {
    setForm((current) => ({ ...current, [target.name]: target.value }));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    const quantity = numberValue(form.quantity);
    if (!form.date || quantity <= 0) {
      setMessage("Enter a date and quantity greater than zero.");
      return;
    }

    const material = MATERIALS.find(({ name }) => name === form.material);
    const timestamp = new Date().toISOString();
    setStatus("saving");
    setMessage("");

    try {
      const freshData = await appendRows(
        [
          {
            sheetName: "External_Material_Usage",
            row: {
              Date: form.date,
              Material: material.name,
              Quantity: quantity,
              Unit: material.unit,
              Reference: form.reference.trim(),
              Notes: form.notes.trim(),
            },
          },
          {
            sheetName: "Activity_Log",
            row: {
              Timestamp: timestamp,
              Module: "Material Inventory",
              Action: "External usage",
              Description: `${quantity} ${material.unit} ${material.name} issued`,
              User_Email: user.email,
            },
          },
        ],
        MATERIAL_SHEETS,
      );
      setData(freshData);
      resetForm();
      setMessage("External material usage saved.");
      setStatus("ready");
    } catch (error) {
      if ([401, 403].includes(error.status)) logout();
      else {
        setMessage(error.message);
        setStatus("error");
      }
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm("Delete this external material usage entry?")) return;
    setStatus("saving");
    setMessage("");

    try {
      const freshData = await deleteRows(
        [
          {
            sheetName: "External_Material_Usage",
            rowIndex: row._rowIndex,
          },
        ],
        MATERIAL_SHEETS,
      );
      await appendRows([
        {
          sheetName: "Activity_Log",
          row: {
            Timestamp: new Date().toISOString(),
            Module: "Material Inventory",
            Action: "Deleted",
            Description: `${row.Material} external usage removed`,
            User_Email: user.email,
          },
        },
      ]);
      setData(freshData);
      setMessage("External usage deleted and stock refreshed.");
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
          Raw materials
        </p>
        <h1 className="mt-2 text-2xl font-black sm:text-3xl">
          Material Inventory
        </h1>
        <p className="mt-2 text-sm text-white/55">
          Live balances from opening stock, purchases, production, and external
          usage.
        </p>
      </section>

      {message && (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-panel">
          {message}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {inventory.map((item) => (
          <article
            key={item.name}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-600">{item.name}</p>
                <p
                  className={`mt-2 text-2xl font-black ${
                    item.stock < 0 ? "text-red-600" : "text-slate-900"
                  }`}
                >
                  {formatNumber.format(item.stock)}{" "}
                  <span className="text-sm font-semibold text-slate-400">
                    {item.unit}
                  </span>
                </p>
              </div>
              <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">
                Stock
              </span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-xs">
              <div>
                <p className="text-slate-400">Opening</p>
                <p className="mt-1 font-bold text-slate-700">
                  {formatNumber.format(item.opening)}
                </p>
              </div>
              <div>
                <p className="text-slate-400">Purchases</p>
                <p className="mt-1 font-bold text-slate-700">
                  {formatNumber.format(item.purchases)}
                </p>
              </div>
              <div>
                <p className="text-slate-400">Production use</p>
                <p className="mt-1 font-bold text-slate-700">
                  {formatNumber.format(item.usedInProduction)}
                </p>
              </div>
              <div>
                <p className="text-slate-400">External use</p>
                <p className="mt-1 font-bold text-slate-700">
                  {formatNumber.format(item.externalUsage)}
                </p>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <form
          onSubmit={handleSave}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel sm:p-6"
        >
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">
            Stock issue
          </p>
          <h2 className="mt-1 text-lg font-bold text-slate-900">
            Add external usage
          </h2>

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-slate-500">
                DATE
              </span>
              <input
                type="date"
                name="date"
                value={form.date}
                onChange={handleChange}
                className="focus-ring w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm"
                required
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-slate-500">
                MATERIAL
              </span>
              <select
                name="material"
                value={form.material}
                onChange={handleChange}
                className="focus-ring w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm"
              >
                {MATERIALS.map((material) => (
                  <option key={material.name}>{material.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-slate-500">
                QUANTITY
              </span>
              <input
                type="number"
                name="quantity"
                value={form.quantity}
                onChange={handleChange}
                min="0"
                step="any"
                className="focus-ring w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm"
                required
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-slate-500">
                REFERENCE
              </span>
              <input
                name="reference"
                value={form.reference}
                onChange={handleChange}
                className="focus-ring w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-slate-500">
                NOTES
              </span>
              <textarea
                name="notes"
                value={form.notes}
                onChange={handleChange}
                rows="3"
                className="focus-ring w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={status === "saving"}
            className="focus-ring mt-5 w-full rounded-xl bg-brand-700 px-5 py-3 text-sm font-bold text-white hover:bg-brand-800 disabled:opacity-60"
          >
            {status === "saving" ? "Saving..." : "Save usage"}
          </button>
        </form>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-panel">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-lg font-bold text-slate-900">
              External usage history
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Material</th>
                  <th className="px-5 py-3">Quantity</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.External_Material_Usage.slice()
                  .reverse()
                  .map((row) => (
                    <tr key={row._rowIndex}>
                      <td className="px-5 py-4">{row.Date}</td>
                      <td className="px-5 py-4 font-medium text-slate-800">
                        {row.Material}
                      </td>
                      <td className="px-5 py-4">
                        {formatNumber.format(numberValue(row.Quantity))}{" "}
                        {row.Unit}
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
                {data.External_Material_Usage.length === 0 && (
                  <tr>
                    <td colSpan="4" className="px-5 py-10 text-center text-slate-500">
                      No external usage entries yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
