import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DeleteButton,
  Field,
  Message,
  NotesField,
  PageHeader,
  SaveButton,
} from "../components/WorkflowUI";
import {
  PAYMENT_SOURCES,
  PAYROLL_TYPES,
  PRODUCT_SIZES,
} from "../lib/constants";
import {
  formatCurrency,
  normalizeText,
  numberValue,
  todayInIndia,
} from "../lib/pageUtils";
import { appendRows, deleteRows, syncFromSheets } from "../lib/sheets";
import { useAuth } from "../lib/authContext";
import {
  ALL_FACTORY_ID,
  factoryLabel,
  filterRowsByFactory,
  useFactory,
  withFactoryFields,
} from "../lib/factories";
import { useSessionFormState } from "../lib/useSessionFormState";

const SHEETS = ["Payroll_Log", "Production_Log", "CashFlow_Log"];
const emptyForm = () => ({
  date: todayInIndia(),
  workerName: "",
  type: PAYROLL_TYPES[0],
  productSize: PRODUCT_SIZES[0],
  pieces: "",
  ratePerPiece: "",
  amount: "",
  paymentSource: PAYMENT_SOURCES[0],
  notes: "",
});

export default function Payroll() {
  const { user, logout } = useAuth();
  const { selectedFactoryId } = useFactory();
  const [data, setData] = useState({
    Payroll_Log: [],
    Production_Log: [],
    CashFlow_Log: [],
  });
  const [form, setForm, resetForm] = useSessionFormState(
    "payroll",
    emptyForm,
  );
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const isAdvance = form.type === "Advance";

  const load = useCallback(async () => {
    try {
      const fresh = await syncFromSheets(SHEETS);
      setData({
        Payroll_Log: filterRowsByFactory(fresh.Payroll_Log, selectedFactoryId),
        Production_Log: filterRowsByFactory(fresh.Production_Log, selectedFactoryId),
        CashFlow_Log: filterRowsByFactory(fresh.CashFlow_Log, selectedFactoryId),
      });
      setStatus("ready");
    } catch (error) {
      if ([401, 403].includes(error.status)) logout();
      else setMessage(error.message);
    }
  }, [logout, selectedFactoryId]);
  useEffect(() => { load(); }, [load]);

  const labourEarned = useMemo(
    () => data.Production_Log.reduce((sum, row) => sum + numberValue(row.Labour_Cost), 0),
    [data.Production_Log],
  );
  const advances = useMemo(
    () => data.Payroll_Log
      .filter((row) => (row.Entry_Type || row.Type) === "Advance")
      .reduce((sum, row) => sum + numberValue(row.Amount), 0),
    [data.Payroll_Log],
  );
  const netPayable = labourEarned - advances;
  const pieceRateAmount = numberValue(form.pieces) * numberValue(form.ratePerPiece);
  const amount = form.type === "Wage" && pieceRateAmount > 0
    ? pieceRateAmount
    : numberValue(form.amount);
  const workerSummary = useMemo(() => {
    const workers = new Map();
    data.Payroll_Log.forEach((row) => {
      const name = row.Worker_Name || row.Employee || "Unknown";
      const current = workers.get(normalizeText(name)) || { name, advances: 0, wages: 0 };
      if ((row.Entry_Type || row.Type) === "Advance") current.advances += numberValue(row.Amount);
      else current.wages += numberValue(row.Amount);
      workers.set(normalizeText(name), current);
    });
    return [...workers.values()];
  }, [data.Payroll_Log]);

  const onChange = ({ target }) =>
    setForm((current) => ({ ...current, [target.name]: target.value }));

  const save = async (event) => {
    event.preventDefault();
    if (selectedFactoryId === ALL_FACTORY_ID) {
      setMessage("Select a specific factory before saving payroll.");
      return;
    }
    if (!form.workerName.trim() || amount <= 0) {
      setMessage("Enter worker name and amount.");
      return;
    }
    setStatus("saving");
    const entryId = `PAY-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    try {
      const fresh = await appendRows(
        [
          {
            sheetName: "Payroll_Log",
            row: withFactoryFields({
              Payroll_Entry_ID: entryId,
              Date: form.date,
              Worker_Name: form.workerName.trim(),
              Entry_Type: form.type,
              Product_Size: form.type === "Wage" ? form.productSize : "",
              Pieces: form.type === "Wage" ? numberValue(form.pieces) : "",
              Rate_Per_Piece:
                form.type === "Wage" ? numberValue(form.ratePerPiece) : "",
              Amount: amount,
              Payment_Source: isAdvance ? form.paymentSource : "",
              Notes: form.notes.trim(),
              Created_At: timestamp,
            }, selectedFactoryId),
          },
          ...(isAdvance ? [{
            sheetName: "CashFlow_Log",
            row: withFactoryFields({
              CashFlow_ID: `CASH-${crypto.randomUUID()}`,
              Date: form.date,
              Type: "Out",
              Source: "Factory",
              Amount: amount,
              Description: `Advance to ${form.workerName.trim()}`,
              Linked_Module: "Payroll",
              Linked_ID: entryId,
              Notes: `Paid via ${form.paymentSource}`,
              Created_At: timestamp,
            }, selectedFactoryId),
          }] : []),
          {
            sheetName: "Activity_Log",
            row: withFactoryFields({
              Timestamp: timestamp, Module: "Payroll", Action: "Created",
              Description: `${form.type} recorded for ${form.workerName.trim()}`, User_Email: user.email,
            }, selectedFactoryId),
          },
        ],
        SHEETS,
      );
      setData({
        Payroll_Log: filterRowsByFactory(fresh.Payroll_Log, selectedFactoryId),
        Production_Log: filterRowsByFactory(fresh.Production_Log, selectedFactoryId),
        CashFlow_Log: filterRowsByFactory(fresh.CashFlow_Log, selectedFactoryId),
      });
      resetForm();
      setMessage("Payroll entry saved.");
      setStatus("ready");
    } catch (error) {
      if ([401, 403].includes(error.status)) logout();
      else setMessage(error.message);
      setStatus("error");
    }
  };

  const remove = async (row) => {
    if (!window.confirm("Delete this payroll entry and any linked cash advance?")) return;
    const linkedCash = data.CashFlow_Log.filter(
      (cash) => cash.Linked_ID === row.Payroll_Entry_ID,
    );
    setStatus("saving");
    try {
      const fresh = await deleteRows(
        [
          ...linkedCash.map((cash) => ({ sheetName: "CashFlow_Log", rowIndex: cash._rowIndex })),
          { sheetName: "Payroll_Log", rowIndex: row._rowIndex },
        ],
        SHEETS,
      );
      await appendRows([{
        sheetName: "Activity_Log",
        row: withFactoryFields({
          Timestamp: new Date().toISOString(), Module: "Payroll", Action: "Deleted",
          Description: `${row.Entry_Type} for ${row.Worker_Name} removed`, User_Email: user.email,
        }, selectedFactoryId === ALL_FACTORY_ID ? row.Factory_ID : selectedFactoryId),
      }]);
      setData({
        Payroll_Log: filterRowsByFactory(fresh.Payroll_Log, selectedFactoryId),
        Production_Log: filterRowsByFactory(fresh.Production_Log, selectedFactoryId),
        CashFlow_Log: filterRowsByFactory(fresh.CashFlow_Log, selectedFactoryId),
      });
      setMessage("Payroll entry and linked cash flow deleted.");
      setStatus("ready");
    } catch (error) {
      if ([401, 403].includes(error.status)) logout();
      else setMessage(error.message);
      setStatus("error");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={factoryLabel(selectedFactoryId)} title="Payroll" description="Track labour earned, worker advances, piece-rate wages, and current payroll due." />
      <Message>{message}</Message>
      <section className="grid gap-4 sm:grid-cols-3">
        {[["Labour earned", labourEarned], ["Advances", advances], ["Net payable", netPayable]].map(([label, value]) => (
          <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
            <p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-black text-slate-900">{formatCurrency.format(value)}</p>
          </article>
        ))}
      </section>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {workerSummary.map((worker) => <article key={worker.name} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
          <p className="font-bold text-slate-900">{worker.name}</p>
          <p className="mt-3 text-sm text-slate-500">Advances: <strong className="text-slate-800">{formatCurrency.format(worker.advances)}</strong></p>
          <p className="mt-1 text-sm text-slate-500">Wage entries: <strong className="text-slate-800">{formatCurrency.format(worker.wages)}</strong></p>
        </article>)}
      </section>

      <form onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel sm:p-7">
        <h2 className="mb-5 text-lg font-bold text-slate-900">New payroll entry</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Date" name="date" type="date" value={form.date} onChange={onChange} required />
          <Field label="Worker name" name="workerName" value={form.workerName} onChange={onChange} required />
          <Field label="Type" name="type" value={form.type} onChange={onChange}>
            {PAYROLL_TYPES.map((value) => <option key={value}>{value}</option>)}
          </Field>
          {form.type === "Wage" && <>
            <Field label="Product size" name="productSize" value={form.productSize} onChange={onChange}>
              {PRODUCT_SIZES.map((value) => <option key={value}>{value}</option>)}
            </Field>
            <Field label="Pieces" name="pieces" type="number" value={form.pieces} onChange={onChange} />
            <Field label="Rate / piece" name="ratePerPiece" type="number" value={form.ratePerPiece} onChange={onChange} />
          </>}
          <Field label={form.type === "Wage" && pieceRateAmount > 0 ? "Calculated amount" : "Amount"} name="amount" type="number" value={form.type === "Wage" && pieceRateAmount > 0 ? pieceRateAmount : form.amount} onChange={onChange} required={pieceRateAmount <= 0} readOnly={form.type === "Wage" && pieceRateAmount > 0} />
          {isAdvance && <Field label="Payment source" name="paymentSource" value={form.paymentSource} onChange={onChange}>
            {PAYMENT_SOURCES.map((value) => <option key={value}>{value}</option>)}
          </Field>}
        </div>
        <div className="mt-4"><NotesField value={form.notes} onChange={onChange} /></div>
        <div className="mt-5 text-right"><SaveButton busy={status === "saving"}>Save payroll entry</SaveButton></div>
      </form>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-panel">
        <div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>
            <th className="px-5 py-3">Date</th><th className="px-5 py-3">Factory</th><th className="px-5 py-3">Worker</th><th className="px-5 py-3">Type</th>
            <th className="px-5 py-3">Pieces</th>
            <th className="px-5 py-3">Amount</th><th className="px-5 py-3 text-right">Action</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data.Payroll_Log.slice().reverse().map((row) => <tr key={row.Payroll_Entry_ID || row._rowIndex}>
              <td className="px-5 py-4">{row.Date}</td><td className="px-5 py-4">{factoryLabel(row.Factory_ID)}</td><td className="px-5 py-4 font-semibold">{row.Worker_Name}</td>
              <td className="px-5 py-4">{row.Entry_Type}</td><td className="px-5 py-4">{row.Pieces || "-"}</td>
              <td className="px-5 py-4">{formatCurrency.format(numberValue(row.Amount))}</td>
              <td className="px-5 py-4 text-right"><DeleteButton onClick={() => remove(row)} /></td>
            </tr>)}
            {!data.Payroll_Log.length && <tr><td colSpan="7" className="px-5 py-10 text-center text-slate-500">No payroll entries yet.</td></tr>}
          </tbody>
        </table></div>
      </section>
    </div>
  );
}
