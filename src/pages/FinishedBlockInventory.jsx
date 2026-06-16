import { useCallback, useEffect, useMemo, useState } from "react";
import { BLOCK_COLORS } from "../lib/constants";
import { blocksToBrass } from "../lib/formulas";
import { appendRows, deleteRows, syncFromSheets } from "../lib/sheets";
import { useAuth } from "../lib/authContext";
import { useSessionFormState } from "../lib/useSessionFormState";

const FINISHED_SHEETS = [
  "Opening_Stock",
  "Production_Variants",
  "Dispatch_Log",
  "QC_Log",
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
  color: BLOCK_COLORS[0],
  blocks: "",
  adjustmentType: "Opening",
  notes: "",
});

const numberValue = (value) => {
  const result = Number(String(value ?? "").replaceAll(",", ""));
  return Number.isFinite(result) ? result : 0;
};
const normalize = (value) => String(value || "").trim().toLowerCase();
const formatNumber = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
});

function colorValue(row) {
  return row.Color || row.Variant || row.Variant_Name || "";
}

function sumForColor(rows, color, fields) {
  return rows.reduce((sum, row) => {
    if (normalize(colorValue(row)) !== normalize(color)) return sum;
    const field = fields.find((name) => row[name] !== undefined);
    return sum + numberValue(field ? row[field] : 0);
  }, 0);
}

function openingForColor(rows, color) {
  return rows.reduce((sum, row) => {
    if (normalize(colorValue(row)) !== normalize(color)) return sum;
    const blocks = numberValue(row.Blocks ?? row.Quantity);
    return normalize(row.Adjustment_Type) === "remove"
      ? sum - Math.abs(blocks)
      : sum + blocks;
  }, 0);
}

export default function FinishedBlockInventory() {
  const { user, logout } = useAuth();
  const [data, setData] = useState(
    Object.fromEntries(FINISHED_SHEETS.map((name) => [name, []])),
  );
  const [form, setForm, resetForm] = useSessionFormState(
    "finished-block-inventory",
    emptyForm,
  );
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");

  const loadData = useCallback(async () => {
    setStatus("loading");
    try {
      setData(await syncFromSheets(FINISHED_SHEETS));
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
      BLOCK_COLORS.map((color) => {
        const opening = openingForColor(data.Opening_Stock, color);
        const produced = sumForColor(data.Production_Variants, color, [
          "Blocks",
          "Current_Stock",
        ]);
        const dispatched = sumForColor(data.Dispatch_Log, color, [
          "Dispatch_Blocks",
          "Blocks",
          "Quantity",
        ]);
        const broken = sumForColor(data.QC_Log, color, [
          "Broken_Blocks",
          "Broken_Quantity",
          "Rejected_Quantity",
        ]);
        const currentStock = opening + produced - dispatched - broken;

        return {
          color,
          opening,
          produced,
          dispatched,
          broken,
          currentStock,
          brass: blocksToBrass(currentStock),
        };
      }),
    [data],
  );

  const handleChange = ({ target }) => {
    setForm((current) => ({ ...current, [target.name]: target.value }));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    const blocks = numberValue(form.blocks);
    if (!form.date || blocks <= 0) {
      setMessage("Enter a date and blocks greater than zero.");
      return;
    }

    const timestamp = new Date().toISOString();
    setStatus("saving");
    setMessage("");

    try {
      const freshData = await appendRows(
        [
          {
            sheetName: "Opening_Stock",
            row: {
              Opening_ID: `OPEN-${crypto.randomUUID()}`,
              Date: form.date,
              Color: form.color,
              Blocks: blocks,
              Brass: blocksToBrass(blocks),
              Adjustment_Type: form.adjustmentType,
              Notes: form.notes.trim(),
              Created_At: timestamp,
            },
          },
          {
            sheetName: "Activity_Log",
            row: {
              Timestamp: timestamp,
              Module: "Finished Block Inventory",
              Action: form.adjustmentType,
              Description: `${blocks} ${form.color} blocks ${form.adjustmentType.toLowerCase()} adjustment`,
              User_Email: user.email,
            },
          },
        ],
        FINISHED_SHEETS,
      );
      setData(freshData);
      resetForm();
      setMessage("Finished block adjustment saved.");
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
    if (!window.confirm("Delete this opening or adjustment entry?")) return;
    setStatus("saving");
    setMessage("");

    try {
      const freshData = await deleteRows(
        [{ sheetName: "Opening_Stock", rowIndex: row._rowIndex }],
        FINISHED_SHEETS,
      );
      await appendRows([
        {
          sheetName: "Activity_Log",
          row: {
            Timestamp: new Date().toISOString(),
            Module: "Finished Block Inventory",
            Action: "Deleted",
            Description: `${row.Color || row.Variant} block adjustment removed`,
            User_Email: user.email,
          },
        },
      ]);
      setData(freshData);
      setMessage("Adjustment deleted and stock refreshed.");
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
          Finished goods
        </p>
        <h1 className="mt-2 text-2xl font-black sm:text-3xl">
          Finished Block Inventory
        </h1>
        <p className="mt-2 text-sm text-white/55">
          Color-wise stock after production, dispatch, breakage, and authorized
          adjustments.
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
            key={item.color}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-bold text-slate-600">{item.color}</p>
                <p
                  className={`mt-2 text-3xl font-black ${
                    item.currentStock < 0 ? "text-red-600" : "text-slate-900"
                  }`}
                >
                  {formatNumber.format(item.currentStock)}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-400">
                  blocks | {formatNumber.format(item.brass)} brass
                </p>
              </div>
              <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">
                Current
              </span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-xs">
              {[
                ["Opening", item.opening],
                ["Produced", item.produced],
                ["Dispatched", item.dispatched],
                ["Broken", item.broken],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-slate-400">{label}</p>
                  <p className="mt-1 font-bold text-slate-700">
                    {formatNumber.format(value)}
                  </p>
                </div>
              ))}
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
            Stock control
          </p>
          <h2 className="mt-1 text-lg font-bold text-slate-900">
            Opening / adjustment
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
                COLOR
              </span>
              <select
                name="color"
                value={form.color}
                onChange={handleChange}
                className="focus-ring w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm"
              >
                {BLOCK_COLORS.map((color) => (
                  <option key={color}>{color}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-slate-500">
                ENTRY TYPE
              </span>
              <select
                name="adjustmentType"
                value={form.adjustmentType}
                onChange={handleChange}
                className="focus-ring w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm"
              >
                <option>Opening</option>
                <option>Add</option>
                <option>Remove</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-slate-500">
                BLOCKS
              </span>
              <input
                type="number"
                name="blocks"
                value={form.blocks}
                onChange={handleChange}
                min="0"
                step="1"
                className="focus-ring w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm"
                required
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
            {status === "saving" ? "Saving..." : "Save adjustment"}
          </button>
        </form>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-panel">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-lg font-bold text-slate-900">
              Opening and adjustments
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Color</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Blocks</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.Opening_Stock.slice()
                  .reverse()
                  .map((row) => (
                    <tr key={row._rowIndex}>
                      <td className="px-5 py-4">{row.Date}</td>
                      <td className="px-5 py-4 font-medium text-slate-800">
                        {row.Color || row.Variant}
                      </td>
                      <td className="px-5 py-4">
                        {row.Adjustment_Type || "Opening"}
                      </td>
                      <td className="px-5 py-4">
                        {formatNumber.format(
                          numberValue(row.Blocks ?? row.Quantity),
                        )}
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
                {data.Opening_Stock.length === 0 && (
                  <tr>
                    <td colSpan="5" className="px-5 py-10 text-center text-slate-500">
                      No opening or adjustment entries yet.
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
