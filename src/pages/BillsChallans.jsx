import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DeleteButton,
  Field,
  Message,
  NotesField,
  PageHeader,
  SaveButton,
} from "../components/WorkflowUI";
import { DOCUMENT_TYPES } from "../lib/constants";
import { CLIENT_CONFIG } from "../lib/clientConfig";
import { brassToBlocks, calculateBillTotals } from "../lib/formulas";
import {
  formatCurrency,
  formatNumber,
  numberValue,
  todayInIndia,
} from "../lib/pageUtils";
import { appendRows, deleteRows, syncFromSheets } from "../lib/sheets";
import { useAuth } from "../lib/authContext";
import { useSessionFormState } from "../lib/useSessionFormState";
import { logoUrl } from "../lib/branding";

const SHEETS = ["CRM_Log", "Dispatch_Log", "Bills_Log"];
const emptyForm = () => ({
  documentType: DOCUMENT_TYPES[0],
  invoiceNo: "",
  date: todayInIndia(),
  crmOrderId: "",
  dispatchId: "",
  clientName: "",
  clientAddress: "",
  placeOfSupply: "Rajasthan",
  item: "Interlocking Paver Blocks",
  hsn: "6810",
  quantityBrass: "",
  rate: "",
  vehicleNo: "",
  transportType: "",
  notes: "",
});

export default function BillsChallans() {
  const { user, logout } = useAuth();
  const [data, setData] = useState({
    CRM_Log: [],
    Dispatch_Log: [],
    Bills_Log: [],
  });
  const [form, setForm, resetForm] = useSessionFormState(
    "bills-challans",
    emptyForm,
  );
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const [printBill, setPrintBill] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await syncFromSheets(SHEETS));
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

  const quantityBlocks = brassToBlocks(form.quantityBrass);
  const totals = useMemo(
    () =>
      calculateBillTotals(
        form.quantityBrass,
        form.rate,
        form.placeOfSupply,
        form.documentType,
      ),
    [form.quantityBrass, form.rate, form.placeOfSupply, form.documentType],
  );

  const onChange = ({ target }) => {
    const { name, value } = target;
    if (name === "crmOrderId") {
      const order = data.CRM_Log.find((row) => row.CRM_Order_ID === value);
      setForm((current) => ({
        ...current,
        crmOrderId: value,
        dispatchId: "",
        clientName: order?.Client_Name || "",
        clientAddress: order?.Location || "",
        placeOfSupply: order?.Location?.toLowerCase().includes("rajasthan")
          ? "Rajasthan"
          : order?.Location || current.placeOfSupply,
        quantityBrass: order?.Order_Brass || "",
        rate: order?.Rate_Per_Brass || "",
      }));
      return;
    }
    if (name === "dispatchId") {
      const dispatch = data.Dispatch_Log.find(
        (row) => row.Dispatch_ID === value,
      );
      setForm((current) => ({
        ...current,
        dispatchId: value,
        quantityBrass: dispatch?.Dispatch_Brass || current.quantityBrass,
        vehicleNo: dispatch?.Vehicle_Number || "",
        transportType: dispatch?.Transport_Type || "",
      }));
      return;
    }
    setForm((current) => ({ ...current, [name]: value }));
  };

  const currentBill = {
    Document_Type: form.documentType,
    Invoice_No: form.invoiceNo,
    Date: form.date,
    Client_Name: form.clientName,
    Client_Address: form.clientAddress,
    Place_Of_Supply: form.placeOfSupply,
    Item: form.item,
    HSN: form.hsn,
    Quantity_Brass: form.quantityBrass,
    Quantity_Blocks: quantityBlocks,
    Rate: form.rate,
    Vehicle_No: form.vehicleNo,
    Transport_Type: form.transportType,
    Taxable_Amount: totals.taxableAmount,
    CGST: totals.cgst,
    SGST: totals.sgst,
    IGST: totals.igst,
    Round_Off: totals.roundOff,
    Final_Amount: totals.finalAmount,
    Notes: form.notes,
  };

  const save = async (event) => {
    event.preventDefault();
    if (
      !form.invoiceNo.trim() ||
      !form.clientName.trim() ||
      numberValue(form.quantityBrass) <= 0 ||
      numberValue(form.rate) <= 0
    ) {
      setMessage("Enter document number, client, quantity, and rate.");
      return;
    }
    if (
      data.Bills_Log.some(
        (row) =>
          String(row.Invoice_No).trim().toLowerCase() ===
          form.invoiceNo.trim().toLowerCase(),
      )
    ) {
      setMessage("This invoice or challan number already exists.");
      return;
    }

    setStatus("saving");
    const timestamp = new Date().toISOString();
    try {
      const fresh = await appendRows(
        [
          {
            sheetName: "Bills_Log",
            row: {
              Bill_ID: `BILL-${crypto.randomUUID()}`,
              ...currentBill,
              CRM_Order_ID: form.crmOrderId,
              Dispatch_ID: form.dispatchId,
              Status: "Issued",
              Created_At: timestamp,
            },
          },
          {
            sheetName: "Activity_Log",
            row: {
              Timestamp: timestamp,
              Module: "Bills & Challans",
              Action: "Created",
              Description: `${form.documentType} ${form.invoiceNo.trim()} issued`,
              User_Email: user.email,
            },
          },
        ],
        ["Bills_Log"],
      );
      setData((current) => ({ ...current, Bills_Log: fresh.Bills_Log }));
      setPrintBill({ ...currentBill });
      resetForm();
      setMessage("Document saved. Use Print / Save as PDF to export it.");
      setStatus("ready");
    } catch (error) {
      if ([401, 403].includes(error.status)) logout();
      else setMessage(error.message);
      setStatus("error");
    }
  };

  const remove = async (row) => {
    if (!window.confirm("Delete this invoice or challan?")) return;
    setStatus("saving");
    try {
      const fresh = await deleteRows(
        [{ sheetName: "Bills_Log", rowIndex: row._rowIndex }],
        ["Bills_Log"],
      );
      await appendRows([
        {
          sheetName: "Activity_Log",
          row: {
            Timestamp: new Date().toISOString(),
            Module: "Bills & Challans",
            Action: "Deleted",
            Description: `${row.Document_Type} ${row.Invoice_No} removed`,
            User_Email: user.email,
          },
        },
      ]);
      setData((current) => ({ ...current, Bills_Log: fresh.Bills_Log }));
      setMessage("Document deleted.");
      setStatus("ready");
    } catch (error) {
      if ([401, 403].includes(error.status)) logout();
      else setMessage(error.message);
      setStatus("error");
    }
  };

  const printDocument = (bill) => {
    setPrintBill(bill);
    window.setTimeout(() => window.print(), 50);
  };
  const selectedOrderDispatches = data.Dispatch_Log.filter(
    (row) => row.CRM_Order_ID === form.crmOrderId,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Business documents"
        title="Bills & Challans"
        description="Create branded tax invoices and delivery challans from client orders and dispatches."
      />
      <Message>{message}</Message>

      <form
        onSubmit={save}
        className="no-print rounded-2xl border border-slate-200 bg-white p-5 shadow-panel sm:p-7"
      >
        <h2 className="mb-5 text-lg font-bold text-slate-900">New document</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Document type" name="documentType" value={form.documentType} onChange={onChange}>
            {DOCUMENT_TYPES.map((value) => <option key={value}>{value}</option>)}
          </Field>
          <Field label="Invoice / challan no." name="invoiceNo" value={form.invoiceNo} onChange={onChange} required />
          <Field label="Date" name="date" type="date" value={form.date} onChange={onChange} required />
          <Field label="CRM order" name="crmOrderId" value={form.crmOrderId} onChange={onChange}>
            <option value="">Optional order link</option>
            {data.CRM_Log.map((order) => (
              <option key={order.CRM_Order_ID} value={order.CRM_Order_ID}>
                {order.Client_Name} | {order.Color}
              </option>
            ))}
          </Field>
          <Field label="Dispatch" name="dispatchId" value={form.dispatchId} onChange={onChange}>
            <option value="">Optional dispatch link</option>
            {selectedOrderDispatches.map((dispatch) => (
              <option key={dispatch.Dispatch_ID} value={dispatch.Dispatch_ID}>
                {dispatch.Date} | {dispatch.Dispatch_Brass} brass
              </option>
            ))}
          </Field>
          <Field label="Client name" name="clientName" value={form.clientName} onChange={onChange} required />
          <Field label="Client address" name="clientAddress" value={form.clientAddress} onChange={onChange} />
          <Field label="Place of supply" name="placeOfSupply" value={form.placeOfSupply} onChange={onChange} required />
          <Field label="Item" name="item" value={form.item} onChange={onChange} required />
          <Field label="HSN" name="hsn" value={form.hsn} onChange={onChange} required />
          <Field label="Quantity brass" name="quantityBrass" type="number" value={form.quantityBrass} onChange={onChange} required />
          <Field label="Quantity blocks" name="quantityBlocks" value={quantityBlocks || ""} onChange={() => {}} disabled />
          <Field label="Rate" name="rate" type="number" value={form.rate} onChange={onChange} required />
          <Field label="Vehicle no." name="vehicleNo" value={form.vehicleNo} onChange={onChange} />
          <Field label="Transport type" name="transportType" value={form.transportType} onChange={onChange} />
        </div>
        <div className="mt-4"><NotesField value={form.notes} onChange={onChange} /></div>
        <div className="mt-5 flex flex-col gap-4 rounded-2xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
            <span>Taxable: <strong className="text-slate-900">{formatCurrency.format(totals.taxableAmount)}</strong></span>
            <span>GST: <strong className="text-slate-900">{formatCurrency.format(totals.cgst + totals.sgst + totals.igst)}</strong></span>
            <span>Final: <strong className="text-slate-900">{formatCurrency.format(totals.finalAmount)}</strong></span>
          </div>
          <SaveButton busy={status === "saving"}>Save document</SaveButton>
        </div>
      </form>

      <section className="no-print overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-panel">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Date</th><th className="px-5 py-3">Number</th>
                <th className="px-5 py-3">Type</th><th className="px-5 py-3">Client</th>
                <th className="px-5 py-3">Amount</th><th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.Bills_Log.slice().reverse().map((row) => (
                <tr key={row.Bill_ID || row._rowIndex}>
                  <td className="px-5 py-4">{row.Date}</td>
                  <td className="px-5 py-4 font-semibold">{row.Invoice_No}</td>
                  <td className="px-5 py-4">{row.Document_Type}</td>
                  <td className="px-5 py-4">{row.Client_Name}</td>
                  <td className="px-5 py-4">{formatCurrency.format(numberValue(row.Final_Amount))}</td>
                  <td className="px-5 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => printDocument(row)}
                      className="focus-ring mr-2 rounded-lg px-3 py-2 text-xs font-bold text-brand-700 hover:bg-brand-50"
                    >
                      Print / PDF
                    </button>
                    <DeleteButton onClick={() => remove(row)} />
                  </td>
                </tr>
              ))}
              {!data.Bills_Log.length && (
                <tr><td colSpan="6" className="px-5 py-10 text-center text-slate-500">No bills or challans yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {printBill && <InvoiceDocument bill={printBill} />}
    </div>
  );
}

function InvoiceDocument({ bill }) {
  const totalGst =
    numberValue(bill.CGST) + numberValue(bill.SGST) + numberValue(bill.IGST);

  return (
    <article className="print-document mx-auto hidden max-w-4xl bg-white p-10 text-slate-900">
      <header className="flex justify-between gap-8 border-b-2 border-slate-900 pb-6">
        <div className="flex gap-4">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={CLIENT_CONFIG.companyName}
              className="h-20 w-20 rounded-xl object-cover"
            />
          ) : (
            <span className="grid h-20 w-20 place-items-center rounded-xl bg-slate-900 text-xl font-black text-white">
              {CLIENT_CONFIG.brandInitials}
            </span>
          )}
          <div>
          <p className="text-xs font-black tracking-[0.18em]">{CLIENT_CONFIG.appName}</p>
          <h1 className="mt-2 text-2xl font-black">{CLIENT_CONFIG.companyName}</h1>
          <p className="mt-2 max-w-lg text-sm leading-6">{CLIENT_CONFIG.address}</p>
          <p className="text-sm">{CLIENT_CONFIG.phone}</p>
          <p className="text-sm">{CLIENT_CONFIG.gstin}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xl font-black uppercase">{bill.Document_Type}</p>
          <p className="mt-3 text-sm">No: <strong>{bill.Invoice_No}</strong></p>
          <p className="text-sm">Date: <strong>{bill.Date}</strong></p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-8 border-b border-slate-300 py-6 text-sm">
        <div>
          <p className="text-xs font-bold uppercase text-slate-500">Bill to</p>
          <p className="mt-2 font-bold">{bill.Client_Name}</p>
          <p className="mt-1 leading-6">{bill.Client_Address}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-slate-500">Supply details</p>
          <p className="mt-2">Place: <strong>{bill.Place_Of_Supply}</strong></p>
          <p>Transport: <strong>{bill.Transport_Type || "-"}</strong></p>
          <p>Vehicle: <strong>{bill.Vehicle_No || "-"}</strong></p>
        </div>
      </section>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-900 text-white">
            <th className="border border-slate-900 px-3 py-3 text-left">Item</th>
            <th className="border border-slate-900 px-3 py-3">HSN</th>
            <th className="border border-slate-900 px-3 py-3">Brass</th>
            <th className="border border-slate-900 px-3 py-3">Blocks</th>
            <th className="border border-slate-900 px-3 py-3 text-right">Rate</th>
            <th className="border border-slate-900 px-3 py-3 text-right">Taxable</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-slate-300 px-3 py-4">{bill.Item}</td>
            <td className="border border-slate-300 px-3 py-4 text-center">{bill.HSN}</td>
            <td className="border border-slate-300 px-3 py-4 text-center">{formatNumber.format(numberValue(bill.Quantity_Brass))}</td>
            <td className="border border-slate-300 px-3 py-4 text-center">{formatNumber.format(numberValue(bill.Quantity_Blocks))}</td>
            <td className="border border-slate-300 px-3 py-4 text-right">{formatCurrency.format(numberValue(bill.Rate))}</td>
            <td className="border border-slate-300 px-3 py-4 text-right">{formatCurrency.format(numberValue(bill.Taxable_Amount))}</td>
          </tr>
        </tbody>
      </table>

      <section className="ml-auto mt-6 w-full max-w-sm space-y-2 text-sm">
        <div className="flex justify-between"><span>Taxable amount</span><strong>{formatCurrency.format(numberValue(bill.Taxable_Amount))}</strong></div>
        {numberValue(bill.CGST) > 0 && <div className="flex justify-between"><span>CGST</span><strong>{formatCurrency.format(numberValue(bill.CGST))}</strong></div>}
        {numberValue(bill.SGST) > 0 && <div className="flex justify-between"><span>SGST</span><strong>{formatCurrency.format(numberValue(bill.SGST))}</strong></div>}
        {numberValue(bill.IGST) > 0 && <div className="flex justify-between"><span>IGST</span><strong>{formatCurrency.format(numberValue(bill.IGST))}</strong></div>}
        {totalGst === 0 && <div className="flex justify-between"><span>GST</span><strong>{formatCurrency.format(0)}</strong></div>}
        <div className="flex justify-between"><span>Round-off</span><strong>{formatCurrency.format(numberValue(bill.Round_Off))}</strong></div>
        <div className="flex justify-between border-t-2 border-slate-900 pt-3 text-lg"><span>Final amount</span><strong>{formatCurrency.format(numberValue(bill.Final_Amount))}</strong></div>
      </section>

      <footer className="mt-14 flex items-end justify-between border-t border-slate-300 pt-6 text-xs">
        <div>
          <p>{bill.Notes}</p>
          <p className="mt-4 text-slate-500">{CLIENT_CONFIG.poweredBy}</p>
        </div>
        <div className="text-right">
          <div className="mb-10 border-b border-slate-400" />
          <p className="font-bold">Authorized Signatory</p>
        </div>
      </footer>
    </article>
  );
}
