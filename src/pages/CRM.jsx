import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DeleteButton,
  Field,
  Message,
  NotesField,
  PageHeader,
  SaveButton,
} from "../components/WorkflowUI";
import { BLOCK_COLORS, CRM_STATUSES } from "../lib/constants";
import { brassToBlocks, calculateOrderValue } from "../lib/formulas";
import {
  formatCurrency,
  formatNumber,
  numberValue,
  todayInIndia,
} from "../lib/pageUtils";
import { appendRows, deleteRows, syncFromSheets } from "../lib/sheets";
import { useAuth } from "../lib/authContext";
import { useSessionFormState } from "../lib/useSessionFormState";

const emptyForm = () => ({
  date: todayInIndia(),
  clientName: "",
  phone: "",
  location: "",
  color: BLOCK_COLORS[0],
  orderBrass: "",
  ratePerBrass: "",
  status: CRM_STATUSES[0],
  notes: "",
});

export default function CRM() {
  const { user, logout } = useAuth();
  const [form, setForm, resetForm] = useSessionFormState("crm", emptyForm);
  const [orders, setOrders] = useState([]);
  const [dispatchRows, setDispatchRows] = useState([]);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await syncFromSheets(["CRM_Log", "Dispatch_Log"]);
      setOrders(data.CRM_Log);
      setDispatchRows(data.Dispatch_Log);
      setStatus("ready");
    } catch (error) {
      if ([401, 403].includes(error.status)) logout();
      else setMessage(error.message);
    }
  }, [logout]);

  useEffect(() => {
    load();
  }, [load]);

  const orderBlocks = brassToBlocks(form.orderBrass);
  const orderValue = calculateOrderValue(form.orderBrass, form.ratePerBrass);
  const summaries = useMemo(
    () =>
      CRM_STATUSES.map((orderStatus) => ({
        status: orderStatus,
        count: orders.filter((row) => row.Status === orderStatus).length,
      })),
    [orders],
  );

  const onChange = ({ target }) =>
    setForm((current) => ({ ...current, [target.name]: target.value }));

  const save = async (event) => {
    event.preventDefault();
    if (
      !form.clientName.trim() ||
      numberValue(form.orderBrass) <= 0 ||
      numberValue(form.ratePerBrass) <= 0
    ) {
      setMessage("Enter the client, order brass, and rate.");
      return;
    }

    setStatus("saving");
    setMessage("");
    const timestamp = new Date().toISOString();
    try {
      const data = await appendRows(
        [
          {
            sheetName: "CRM_Log",
            row: {
              CRM_Order_ID: `CRM-${crypto.randomUUID()}`,
              Date: form.date,
              Client_Name: form.clientName.trim(),
              Phone: form.phone.trim(),
              Location: form.location.trim(),
              Color: form.color,
              Order_Brass: numberValue(form.orderBrass),
              Order_Blocks: orderBlocks,
              Rate_Per_Brass: numberValue(form.ratePerBrass),
              Order_Value: orderValue,
              Status: form.status,
              Notes: form.notes.trim(),
              Created_At: timestamp,
            },
          },
          {
            sheetName: "Activity_Log",
            row: {
              Timestamp: timestamp,
              Module: "CRM",
              Action: "Created",
              Description: `${form.clientName.trim()} order recorded`,
              User_Email: user.email,
            },
          },
        ],
        ["CRM_Log", "Dispatch_Log"],
      );
      setOrders(data.CRM_Log);
      setDispatchRows(data.Dispatch_Log);
      resetForm();
      setMessage("CRM order saved.");
      setStatus("ready");
    } catch (error) {
      if ([401, 403].includes(error.status)) logout();
      else setMessage(error.message);
      setStatus("error");
    }
  };

  const remove = async (row) => {
    if (!window.confirm("Delete this CRM order?")) return;
    setStatus("saving");
    const linkedDispatches = dispatchRows.filter(
      (dispatch) => dispatch.CRM_Order_ID === row.CRM_Order_ID,
    );
    try {
      const data = await deleteRows(
        [
          ...linkedDispatches.map((dispatch) => ({
            sheetName: "Dispatch_Log",
            rowIndex: dispatch._rowIndex,
          })),
          { sheetName: "CRM_Log", rowIndex: row._rowIndex },
        ],
        [
          "CRM_Log",
          "Dispatch_Log",
          "Opening_Stock",
          "Production_Variants",
          "QC_Log",
        ],
      );
      await appendRows([
        {
          sheetName: "Activity_Log",
          row: {
            Timestamp: new Date().toISOString(),
            Module: "CRM",
            Action: "Deleted",
            Description: `${row.Client_Name} order removed`,
            User_Email: user.email,
          },
        },
      ]);
      setOrders(data.CRM_Log);
      setDispatchRows(data.Dispatch_Log);
      setMessage(
        linkedDispatches.length
          ? "CRM order and linked dispatches deleted."
          : "CRM order deleted.",
      );
      setStatus("ready");
    } catch (error) {
      if ([401, 403].includes(error.status)) logout();
      else setMessage(error.message);
      setStatus("error");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales pipeline"
        title="CRM"
        description="Manage client orders and their current fulfilment status."
      />
      <Message>{message}</Message>

      <section className="grid gap-4 sm:grid-cols-3">
        {summaries.map((item) => (
          <article
            key={item.status}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel"
          >
            <p className="text-sm text-slate-500">{item.status}</p>
            <p className="mt-2 text-3xl font-black text-slate-900">{item.count}</p>
          </article>
        ))}
      </section>

      <form
        onSubmit={save}
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel sm:p-7"
      >
        <h2 className="mb-5 text-lg font-bold text-slate-900">New client order</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Date" name="date" type="date" value={form.date} onChange={onChange} required />
          <Field label="Client name" name="clientName" value={form.clientName} onChange={onChange} required />
          <Field label="Phone" name="phone" value={form.phone} onChange={onChange} />
          <Field label="Location" name="location" value={form.location} onChange={onChange} />
          <Field label="Color" name="color" value={form.color} onChange={onChange}>
            {BLOCK_COLORS.map((value) => <option key={value}>{value}</option>)}
          </Field>
          <Field label="Order brass" name="orderBrass" type="number" value={form.orderBrass} onChange={onChange} required />
          <Field label="Rate per brass" name="ratePerBrass" type="number" value={form.ratePerBrass} onChange={onChange} required />
          <Field label="Status" name="status" value={form.status} onChange={onChange}>
            {CRM_STATUSES.map((value) => <option key={value}>{value}</option>)}
          </Field>
        </div>
        <div className="mt-4">
          <NotesField value={form.notes} onChange={onChange} />
        </div>
        <div className="mt-5 flex flex-col gap-4 rounded-2xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            Final order: <strong className="text-slate-900">{formatNumber.format(orderBlocks)} blocks</strong>
            {" | "}
            <strong className="text-slate-900">{formatCurrency.format(orderValue)}</strong>
          </p>
          <SaveButton busy={status === "saving"}>Save order</SaveButton>
        </div>
      </form>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-panel">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Date</th><th className="px-5 py-3">Client</th>
                <th className="px-5 py-3">Color</th><th className="px-5 py-3">Order</th>
                <th className="px-5 py-3">Value</th><th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.slice().reverse().map((row) => (
                <tr key={row.CRM_Order_ID || row._rowIndex}>
                  <td className="px-5 py-4">{row.Date}</td>
                  <td className="px-5 py-4 font-semibold text-slate-800">{row.Client_Name}</td>
                  <td className="px-5 py-4">{row.Color}</td>
                  <td className="px-5 py-4">{formatNumber.format(numberValue(row.Order_Brass))} brass</td>
                  <td className="px-5 py-4">{formatCurrency.format(numberValue(row.Order_Value))}</td>
                  <td className="px-5 py-4">{row.Status}</td>
                  <td className="px-5 py-4 text-right"><DeleteButton onClick={() => remove(row)} /></td>
                </tr>
              ))}
              {!orders.length && <tr><td colSpan="7" className="px-5 py-10 text-center text-slate-500">No CRM orders yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
