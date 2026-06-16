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
  MATERIALS,
  PAYMENT_SOURCES,
  VENDOR_TYPES,
} from "../lib/constants";
import {
  formatCurrency,
  formatNumber,
  normalizeText,
  numberValue,
  todayInIndia,
} from "../lib/pageUtils";
import { appendRows, deleteRows, syncFromSheets } from "../lib/sheets";
import { useAuth } from "../lib/authContext";
import { useSessionFormState } from "../lib/useSessionFormState";

const SHEETS = ["Vendor_Ledger", "CashFlow_Log"];
const emptyForm = () => ({
  date: todayInIndia(),
  vendorName: "",
  material: MATERIALS[0].name,
  type: VENDOR_TYPES[0],
  quantity: "",
  unit: MATERIALS[0].unit,
  amount: "",
  paymentSource: PAYMENT_SOURCES[0],
  notes: "",
});

export default function VendorLedger() {
  const { user, logout } = useAuth();
  const [data, setData] = useState({ Vendor_Ledger: [], CashFlow_Log: [] });
  const [form, setForm, resetForm] = useSessionFormState(
    "vendor-ledger",
    emptyForm,
  );
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const isPayment = form.type === "Payment";

  const load = useCallback(async () => {
    try {
      setData(await syncFromSheets(SHEETS));
      setStatus("ready");
    } catch (error) {
      if ([401, 403].includes(error.status)) logout();
      else setMessage(error.message);
    }
  }, [logout]);
  useEffect(() => { load(); }, [load]);

  const summaries = useMemo(() => {
    const vendors = new Map();
    data.Vendor_Ledger.forEach((row) => {
      const name = row.VendorName || row.Vendor || "Unknown";
      const current = vendors.get(normalizeText(name)) || {
        name,
        invoices: 0,
        payments: 0,
      };
      const type = row.Type;
      if (type === "Payment") current.payments += numberValue(row.Amount ?? row.Credit);
      else current.invoices += numberValue(row.Amount ?? row.Debit);
      vendors.set(normalizeText(name), current);
    });
    return [...vendors.values()].map((item) => ({
      ...item,
      outstanding: item.invoices - item.payments,
    }));
  }, [data.Vendor_Ledger]);

  const onChange = ({ target }) => {
    if (target.name === "material") {
      const material = MATERIALS.find(({ name }) => name === target.value);
      setForm((current) => ({
        ...current,
        material: target.value,
        unit: material?.unit || "",
      }));
      return;
    }
    setForm((current) => ({ ...current, [target.name]: target.value }));
  };

  const save = async (event) => {
    event.preventDefault();
    const amount = numberValue(form.amount);
    const quantity = numberValue(form.quantity);
    if (!form.vendorName.trim() || amount <= 0 || (!isPayment && quantity <= 0)) {
      setMessage("Enter vendor, amount, and invoice quantity.");
      return;
    }
    setStatus("saving");
    const entryId = `VEN-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    const operations = [
      {
        sheetName: "Vendor_Ledger",
        row: {
          Vendor_Entry_ID: entryId,
          Date: form.date,
          VendorName: form.vendorName.trim(),
          Material: isPayment ? "" : form.material,
          Type: form.type,
          Quantity: isPayment ? "" : quantity,
          Unit: isPayment ? "" : form.unit,
          Amount: amount,
          PaymentSource: isPayment ? form.paymentSource : "",
          Notes: form.notes.trim(),
          Created_At: timestamp,
        },
      },
      ...(isPayment
        ? [{
            sheetName: "CashFlow_Log",
            row: {
              CashFlow_ID: `CASH-${crypto.randomUUID()}`,
              Date: form.date,
              Type: "Out",
              Source: "Factory",
              Amount: amount,
              Description: `Payment to ${form.vendorName.trim()}`,
              Linked_Module: "Vendor Ledger",
              Linked_ID: entryId,
              Notes: `Paid via ${form.paymentSource}`,
              Created_At: timestamp,
            },
          }]
        : []),
      {
        sheetName: "Activity_Log",
        row: {
          Timestamp: timestamp,
          Module: "Vendor Ledger",
          Action: "Created",
          Description: `${form.type} recorded for ${form.vendorName.trim()}`,
          User_Email: user.email,
        },
      },
    ];

    try {
      const fresh = await appendRows(operations, [
        ...SHEETS,
        "Opening_Material_Stock",
        "Production_Log",
        "External_Material_Usage",
      ]);
      setData({ Vendor_Ledger: fresh.Vendor_Ledger, CashFlow_Log: fresh.CashFlow_Log });
      resetForm();
      setMessage("Vendor entry saved.");
      setStatus("ready");
    } catch (error) {
      if ([401, 403].includes(error.status)) logout();
      else setMessage(error.message);
      setStatus("error");
    }
  };

  const remove = async (row) => {
    if (!window.confirm("Delete this vendor entry and any linked cash payment?")) return;
    const linkedCash = data.CashFlow_Log.filter(
      (cash) => cash.Linked_ID === row.Vendor_Entry_ID,
    );
    setStatus("saving");
    try {
      const fresh = await deleteRows(
        [
          ...linkedCash.map((cash) => ({ sheetName: "CashFlow_Log", rowIndex: cash._rowIndex })),
          { sheetName: "Vendor_Ledger", rowIndex: row._rowIndex },
        ],
        [...SHEETS, "Opening_Material_Stock", "Production_Log", "External_Material_Usage"],
      );
      await appendRows([{
        sheetName: "Activity_Log",
        row: {
          Timestamp: new Date().toISOString(), Module: "Vendor Ledger", Action: "Deleted",
          Description: `${row.Type} for ${row.VendorName} removed`, User_Email: user.email,
        },
      }]);
      setData({ Vendor_Ledger: fresh.Vendor_Ledger, CashFlow_Log: fresh.CashFlow_Log });
      setMessage("Vendor entry and linked cash flow deleted.");
      setStatus("ready");
    } catch (error) {
      if ([401, 403].includes(error.status)) logout();
      else setMessage(error.message);
      setStatus("error");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Supplier accounts" title="Vendor Ledger" description="Track material invoices, payments, and vendor outstanding balances." />
      <Message>{message}</Message>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {summaries.map((item) => <article key={item.name} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
          <p className="font-bold text-slate-900">{item.name}</p>
          <p className="mt-3 text-2xl font-black text-slate-900">{formatCurrency.format(item.outstanding)}</p>
          <p className="mt-1 text-xs text-slate-500">Outstanding</p>
        </article>)}
        {!summaries.length && <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">No vendor balances yet.</div>}
      </section>

      <form onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel sm:p-7">
        <h2 className="mb-5 text-lg font-bold text-slate-900">New vendor entry</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Date" name="date" type="date" value={form.date} onChange={onChange} required />
          <Field label="Vendor name" name="vendorName" value={form.vendorName} onChange={onChange} required />
          <Field label="Type" name="type" value={form.type} onChange={onChange}>
            {VENDOR_TYPES.map((value) => <option key={value}>{value}</option>)}
          </Field>
          {!isPayment && <>
            <Field label="Material" name="material" value={form.material} onChange={onChange}>
              {MATERIALS.map(({ name }) => <option key={name}>{name}</option>)}
            </Field>
            <Field label="Quantity" name="quantity" type="number" value={form.quantity} onChange={onChange} required />
            <Field label="Unit" name="unit" value={form.unit} onChange={onChange} disabled />
          </>}
          <Field label="Amount" name="amount" type="number" value={form.amount} onChange={onChange} required />
          {isPayment && <Field label="Payment source" name="paymentSource" value={form.paymentSource} onChange={onChange}>
            {PAYMENT_SOURCES.map((value) => <option key={value}>{value}</option>)}
          </Field>}
        </div>
        <div className="mt-4"><NotesField value={form.notes} onChange={onChange} /></div>
        <div className="mt-5 text-right"><SaveButton busy={status === "saving"}>Save vendor entry</SaveButton></div>
      </form>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-panel">
        <div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>
            <th className="px-5 py-3">Date</th><th className="px-5 py-3">Vendor</th><th className="px-5 py-3">Type</th>
            <th className="px-5 py-3">Material / Qty</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3 text-right">Action</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data.Vendor_Ledger.slice().reverse().map((row) => <tr key={row.Vendor_Entry_ID || row._rowIndex}>
              <td className="px-5 py-4">{row.Date}</td><td className="px-5 py-4 font-semibold">{row.VendorName}</td>
              <td className="px-5 py-4">{row.Type}</td><td className="px-5 py-4">{row.Material ? `${formatNumber.format(numberValue(row.Quantity))} ${row.Unit} ${row.Material}` : "-"}</td>
              <td className="px-5 py-4">{formatCurrency.format(numberValue(row.Amount))}</td><td className="px-5 py-4 text-right"><DeleteButton onClick={() => remove(row)} /></td>
            </tr>)}
            {!data.Vendor_Ledger.length && <tr><td colSpan="6" className="px-5 py-10 text-center text-slate-500">No vendor entries yet.</td></tr>}
          </tbody>
        </table></div>
      </section>
    </div>
  );
}
