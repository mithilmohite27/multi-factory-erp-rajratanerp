import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DeleteButton,
  Field,
  Message,
  NotesField,
  PageHeader,
  SaveButton,
} from "../components/WorkflowUI";
import { CASH_SOURCES, CASH_TYPES } from "../lib/constants";
import {
  formatCurrency,
  numberValue,
  todayInIndia,
} from "../lib/pageUtils";
import { appendRows, deleteRows, syncFromSheets } from "../lib/sheets";
import { useAuth } from "../lib/authContext";
import { useSessionFormState } from "../lib/useSessionFormState";

const emptyForm = () => ({
  date: todayInIndia(),
  type: CASH_TYPES[0],
  source: CASH_SOURCES[0],
  amount: "",
  description: "",
  linkedModule: "",
  linkedId: "",
  notes: "",
});

function signedAmount(row) {
  return String(row.Type).trim().toLowerCase() === "in"
    ? numberValue(row.Amount)
    : -numberValue(row.Amount);
}

export default function CashRegister() {
  const { user, logout } = useAuth();
  const [entries, setEntries] = useState([]);
  const [form, setForm, resetForm] = useSessionFormState(
    "cash-register",
    emptyForm,
  );
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await syncFromSheets(["CashFlow_Log"]);
      setEntries(data.CashFlow_Log);
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
    load();
  }, [load]);

  const summary = useMemo(() => {
    const totalIn = entries
      .filter((row) => String(row.Type).toLowerCase() === "in")
      .reduce((sum, row) => sum + numberValue(row.Amount), 0);
    const totalOut = entries
      .filter((row) => String(row.Type).toLowerCase() !== "in")
      .reduce((sum, row) => sum + numberValue(row.Amount), 0);
    const balanceFor = (source) =>
      entries
        .filter((row) => (row.Source || "Factory") === source)
        .reduce((sum, row) => sum + signedAmount(row), 0);

    return {
      factory: balanceFor("Factory"),
      external: balanceFor("External"),
      totalIn,
      totalOut,
      net: totalIn - totalOut,
    };
  }, [entries]);

  const onChange = ({ target }) =>
    setForm((current) => ({ ...current, [target.name]: target.value }));

  const save = async (event) => {
    event.preventDefault();
    const amount = numberValue(form.amount);
    if (amount <= 0 || !form.description.trim()) {
      setMessage("Enter an amount and description.");
      return;
    }

    setStatus("saving");
    setMessage("");
    const timestamp = new Date().toISOString();
    try {
      const data = await appendRows(
        [
          {
            sheetName: "CashFlow_Log",
            row: {
              CashFlow_ID: `CASH-${crypto.randomUUID()}`,
              Date: form.date,
              Type: form.type,
              Source: form.source,
              Amount: amount,
              Description: form.description.trim(),
              Linked_Module: form.linkedModule.trim(),
              Linked_ID: form.linkedId.trim(),
              Notes: form.notes.trim(),
              Created_At: timestamp,
            },
          },
          {
            sheetName: "Activity_Log",
            row: {
              Timestamp: timestamp,
              Module: "Cash Register",
              Action: "Created",
              Description: `${form.type} cash entry recorded`,
              User_Email: user.email,
            },
          },
        ],
        ["CashFlow_Log"],
      );
      setEntries(data.CashFlow_Log);
      resetForm();
      setMessage("Cash entry saved.");
      setStatus("ready");
    } catch (error) {
      if ([401, 403].includes(error.status)) logout();
      else setMessage(error.message);
      setStatus("error");
    }
  };

  const remove = async (row) => {
    if (!window.confirm("Delete this cash entry?")) return;
    setStatus("saving");
    try {
      const data = await deleteRows(
        [{ sheetName: "CashFlow_Log", rowIndex: row._rowIndex }],
        ["CashFlow_Log"],
      );
      await appendRows([
        {
          sheetName: "Activity_Log",
          row: {
            Timestamp: new Date().toISOString(),
            Module: "Cash Register",
            Action: "Deleted",
            Description: `${row.Type} cash entry removed`,
            User_Email: user.email,
          },
        },
      ]);
      setEntries(data.CashFlow_Log);
      setMessage("Cash entry deleted.");
      setStatus("ready");
    } catch (error) {
      if ([401, 403].includes(error.status)) logout();
      else setMessage(error.message);
      setStatus("error");
    }
  };

  const cards = [
    ["Factory balance", summary.factory],
    ["External balance", summary.external],
    ["Total cash in", summary.totalIn],
    ["Total cash out", summary.totalOut],
    ["Net cash", summary.net],
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Cash control"
        title="Cash Register"
        description="Track factory and external cash movements with live balances."
      />
      <Message>{message}</Message>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map(([label, value]) => (
          <article
            key={label}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel"
          >
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-xl font-black text-slate-900">
              {formatCurrency.format(value)}
            </p>
          </article>
        ))}
      </section>

      <form
        onSubmit={save}
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel sm:p-7"
      >
        <h2 className="mb-5 text-lg font-bold text-slate-900">New cash entry</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Date" name="date" type="date" value={form.date} onChange={onChange} required />
          <Field label="Type" name="type" value={form.type} onChange={onChange}>
            {CASH_TYPES.map((value) => <option key={value}>{value}</option>)}
          </Field>
          <Field label="Source" name="source" value={form.source} onChange={onChange}>
            {CASH_SOURCES.map((value) => <option key={value}>{value}</option>)}
          </Field>
          <Field label="Amount" name="amount" type="number" value={form.amount} onChange={onChange} required />
          <Field label="Description" name="description" value={form.description} onChange={onChange} required />
          <Field label="Linked module" name="linkedModule" value={form.linkedModule} onChange={onChange} />
          <Field label="Linked ID" name="linkedId" value={form.linkedId} onChange={onChange} />
        </div>
        <div className="mt-4"><NotesField value={form.notes} onChange={onChange} /></div>
        <div className="mt-5 text-right">
          <SaveButton busy={status === "saving"}>Save cash entry</SaveButton>
        </div>
      </form>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-panel">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">Recent cash entries</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Date</th><th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Source</th><th className="px-5 py-3">Description</th>
                <th className="px-5 py-3">Amount</th><th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.slice().reverse().map((row) => (
                <tr key={row.CashFlow_ID || row._rowIndex}>
                  <td className="px-5 py-4">{row.Date}</td>
                  <td className="px-5 py-4 font-semibold">{row.Type}</td>
                  <td className="px-5 py-4">{row.Source || "Factory"}</td>
                  <td className="px-5 py-4">{row.Description}</td>
                  <td className="px-5 py-4">{formatCurrency.format(numberValue(row.Amount))}</td>
                  <td className="px-5 py-4 text-right"><DeleteButton onClick={() => remove(row)} /></td>
                </tr>
              ))}
              {!entries.length && (
                <tr><td colSpan="6" className="px-5 py-10 text-center text-slate-500">No cash entries yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
