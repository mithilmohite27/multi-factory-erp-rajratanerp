import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DeleteButton,
  Field,
  Message,
  NotesField,
  PageHeader,
  SaveButton,
} from "../components/WorkflowUI";
import { TRANSPORT_TYPES } from "../lib/constants";
import { parseColorMix } from "../lib/colorMix";
import {
  brassToBlocks,
  calculateDispatchProgress,
} from "../lib/formulas";
import {
  formatCurrency,
  formatNumber,
  numberValue,
  todayInIndia,
} from "../lib/pageUtils";
import {
  appendRows,
  deleteRows,
  syncFromSheets,
  updateRow,
} from "../lib/sheets";
import { useAuth } from "../lib/authContext";
import { useSessionFormState } from "../lib/useSessionFormState";

const SHEETS = ["CRM_Log", "Dispatch_Log"];
const emptyForm = () => ({
  date: todayInIndia(),
  crmOrderId: "",
  dispatchBrass: "",
  colorDispatchBrass: {},
  transportType: TRANSPORT_TYPES[0],
  driverContact: "",
  vehicleNumber: "",
  freightAmount: "",
  notes: "",
});

export default function Dispatch() {
  const { user, logout } = useAuth();
  const [data, setData] = useState({ CRM_Log: [], Dispatch_Log: [] });
  const [form, setForm, resetForm] = useSessionFormState(
    "dispatch",
    emptyForm,
  );
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");

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

  const orders = useMemo(
    () =>
      data.CRM_Log.map((order) => {
        const dispatchedBlocks = data.Dispatch_Log
          .filter((row) => row.CRM_Order_ID === order.CRM_Order_ID)
          .reduce((sum, row) => sum + numberValue(row.Dispatch_Blocks), 0);
        const orderedBlocks = numberValue(order.Order_Blocks);
        return {
          ...order,
          dispatchedBlocks,
          remainingBlocks: Math.max(0, orderedBlocks - dispatchedBlocks),
          progress: calculateDispatchProgress(orderedBlocks, dispatchedBlocks),
        };
      }),
    [data],
  );
  const activeOrder = orders.find((row) => row.CRM_Order_ID === form.crmOrderId);
  const activeColorMix = parseColorMix(activeOrder?.Color);
  const isDetailedColorMix = activeColorMix.length > 0;
  const dispatchedByColor = useMemo(() => {
    if (!activeOrder) return {};
    return data.Dispatch_Log
      .filter((row) => row.CRM_Order_ID === activeOrder.CRM_Order_ID)
      .reduce((totals, row) => ({
        ...totals,
        [row.Color]: numberValue(totals[row.Color]) + numberValue(row.Dispatch_Brass),
      }), {});
  }, [activeOrder, data.Dispatch_Log]);
  const dispatchBrass = isDetailedColorMix
    ? activeColorMix.reduce(
        (sum, item) => sum + numberValue(form.colorDispatchBrass?.[item.color]),
        0,
      )
    : numberValue(form.dispatchBrass);
  const dispatchBlocks = brassToBlocks(dispatchBrass);
  const revenue = activeOrder
    ? dispatchBrass * numberValue(activeOrder.Rate_Per_Brass)
    : 0;
  const companyTransport = form.transportType === "Company Transport";

  const onChange = ({ target }) =>
    setForm((current) => ({
      ...current,
      [target.name]: target.value,
      ...(target.name === "crmOrderId" ? { dispatchBrass: "", colorDispatchBrass: {} } : {}),
    }));

  const changeColorDispatch = (color, value) => {
    setForm((current) => ({
      ...current,
      colorDispatchBrass: {
        ...current.colorDispatchBrass,
        [color]: value,
      },
    }));
  };

  const save = async (event) => {
    event.preventDefault();
    if (!activeOrder || dispatchBlocks <= 0) {
      setMessage("Select an order and enter dispatch brass.");
      return;
    }
    if (dispatchBlocks > activeOrder.remainingBlocks) {
      setMessage("Dispatch cannot exceed the remaining order quantity.");
      return;
    }
    if (
      isDetailedColorMix &&
      activeColorMix.some((item) =>
        numberValue(form.colorDispatchBrass?.[item.color]) >
        Math.max(0, item.brass - numberValue(dispatchedByColor[item.color])) + 0.0001,
      )
    ) {
      setMessage("A color dispatch cannot exceed its remaining ordered quantity.");
      return;
    }
    setStatus("saving");
    const timestamp = new Date().toISOString();
    try {
      const dispatchItems = isDetailedColorMix
        ? activeColorMix
            .map((item) => ({
              color: item.color,
              brass: numberValue(form.colorDispatchBrass?.[item.color]),
            }))
            .filter((item) => item.brass > 0)
        : [{ color: activeOrder.Color, brass: numberValue(form.dispatchBrass) }];
      const fresh = await appendRows(
        [
          ...dispatchItems.map((item, index) => ({
            sheetName: "Dispatch_Log",
            row: {
              Dispatch_ID: `DSP-${crypto.randomUUID()}`,
              CRM_Order_ID: activeOrder.CRM_Order_ID,
              Date: form.date,
              Client_Name: activeOrder.Client_Name,
              Color: item.color,
              Dispatch_Brass: item.brass,
              Dispatch_Blocks: brassToBlocks(item.brass),
              Transport_Type: form.transportType,
              Driver_Contact: companyTransport ? form.driverContact.trim() : "",
              Vehicle_Number: companyTransport ? form.vehicleNumber.trim() : "",
              Freight_Amount:
                companyTransport && index === 0
                  ? numberValue(form.freightAmount)
                  : "",
              Revenue: item.brass * numberValue(activeOrder.Rate_Per_Brass),
              Notes: form.notes.trim(),
              Created_At: timestamp,
            },
          })),
          {
            sheetName: "Activity_Log",
            row: {
              Timestamp: timestamp,
              Module: "Dispatch",
              Action: "Created",
              Description: `${dispatchBlocks} blocks dispatched to ${activeOrder.Client_Name}`,
              User_Email: user.email,
            },
          },
        ],
        SHEETS,
      );
      const totalDispatched = fresh.Dispatch_Log
        .filter((row) => row.CRM_Order_ID === activeOrder.CRM_Order_ID)
        .reduce((sum, row) => sum + numberValue(row.Dispatch_Blocks), 0);
      const nextStatus =
        totalDispatched >= numberValue(activeOrder.Order_Blocks)
          ? "Dispatched"
          : "Partial";
      await updateRow("CRM_Log", activeOrder._rowIndex, {
        ...activeOrder,
        Status: nextStatus,
      });
      setData(await syncFromSheets(SHEETS));
      resetForm();
      setMessage("Dispatch saved and finished stock refreshed.");
      setStatus("ready");
    } catch (error) {
      if ([401, 403].includes(error.status)) logout();
      else setMessage(error.message);
      setStatus("error");
    }
  };

  const remove = async (row) => {
    if (!window.confirm("Delete this dispatch and restore calculated stock?")) return;
    setStatus("saving");
    try {
      const fresh = await deleteRows(
        [{ sheetName: "Dispatch_Log", rowIndex: row._rowIndex }],
        [...SHEETS, "Opening_Stock", "Production_Variants", "QC_Log"],
      );
      const linkedOrder = fresh.CRM_Log.find(
        (order) => order.CRM_Order_ID === row.CRM_Order_ID,
      );
      if (linkedOrder) {
        const remainingDispatch = fresh.Dispatch_Log
          .filter((dispatch) => dispatch.CRM_Order_ID === row.CRM_Order_ID)
          .reduce(
            (sum, dispatch) =>
              sum + numberValue(dispatch.Dispatch_Blocks),
            0,
          );
        const nextStatus =
          remainingDispatch <= 0
            ? "Order"
            : remainingDispatch >= numberValue(linkedOrder.Order_Blocks)
              ? "Dispatched"
              : "Partial";
        await updateRow("CRM_Log", linkedOrder._rowIndex, {
          ...linkedOrder,
          Status: nextStatus,
        });
      }
      await appendRows([{
        sheetName: "Activity_Log",
        row: {
          Timestamp: new Date().toISOString(), Module: "Dispatch", Action: "Deleted",
          Description: `${row.Dispatch_Blocks} blocks dispatch removed`, User_Email: user.email,
        },
      }]);
      setData(await syncFromSheets(SHEETS));
      setMessage("Dispatch deleted and stock restored.");
      setStatus("ready");
    } catch (error) {
      if ([401, 403].includes(error.status)) logout();
      else setMessage(error.message);
      setStatus("error");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Order fulfilment" title="Dispatch" description="Dispatch against CRM orders with live remaining quantity and stock impact." />
      <Message>{message}</Message>
      <form onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel sm:p-7">
        <h2 className="mb-5 text-lg font-bold text-slate-900">New dispatch</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Date" name="date" type="date" value={form.date} onChange={onChange} required />
          <Field label="CRM order" name="crmOrderId" value={form.crmOrderId} onChange={onChange} required>
            <option value="">Select order</option>
            {orders.filter((order) => order.remainingBlocks > 0).map((order) => (
              <option key={order.CRM_Order_ID} value={order.CRM_Order_ID}>
                {order.Client_Name} | {order.Color} | {formatNumber.format(order.remainingBlocks)} left
              </option>
            ))}
          </Field>
          <Field label="Client name" name="client" value={activeOrder?.Client_Name || ""} onChange={() => {}} disabled />
          <Field label="Color" name="color" value={activeOrder?.Color || ""} onChange={() => {}} disabled />
          {!isDetailedColorMix && <Field label="Dispatch brass" name="dispatchBrass" type="number" value={form.dispatchBrass} onChange={onChange} required />}
          <Field label="Transport type" name="transportType" value={form.transportType} onChange={onChange}>
            {TRANSPORT_TYPES.map((value) => <option key={value}>{value}</option>)}
          </Field>
          {companyTransport && <>
            <Field label="Driver contact" name="driverContact" value={form.driverContact} onChange={onChange} />
            <Field label="Vehicle number" name="vehicleNumber" value={form.vehicleNumber} onChange={onChange} />
            <Field label="Freight amount" name="freightAmount" type="number" value={form.freightAmount} onChange={onChange} />
          </>}
        </div>
        {isDetailedColorMix && (
          <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Color dispatch split</p>
                <p className="mt-1 text-sm text-slate-600">Enter the quantity being dispatched for each color.</p>
              </div>
              <p className="text-sm font-black text-brand-800">Total: {formatNumber.format(dispatchBrass)} brass</p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {activeColorMix.map((item) => {
                const dispatched = numberValue(dispatchedByColor[item.color]);
                const remaining = Math.max(0, item.brass - dispatched);
                return (
                  <label key={item.color} className="rounded-xl border border-slate-200 bg-white p-3">
                    <span className="flex items-center justify-between gap-3 text-sm font-bold text-slate-800">
                      {item.color}
                      <span className="text-xs font-semibold text-slate-500">{formatNumber.format(remaining)} brass left</span>
                    </span>
                    <input
                      type="number"
                      min="0"
                      max={remaining}
                      step="any"
                      disabled={remaining <= 0}
                      value={form.colorDispatchBrass?.[item.color] || ""}
                      onChange={(event) => changeColorDispatch(item.color, event.target.value)}
                      placeholder="Dispatch brass"
                      className="focus-ring mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm disabled:bg-slate-100"
                    />
                    <span className="mt-1 block text-xs font-semibold text-slate-500">
                      {formatNumber.format(brassToBlocks(form.colorDispatchBrass?.[item.color]))} blocks selected
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
        <div className="mt-4"><NotesField value={form.notes} onChange={onChange} /></div>
        <div className="mt-5 flex flex-col gap-4 rounded-2xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            Dispatch: <strong className="text-slate-900">{formatNumber.format(dispatchBlocks)} blocks</strong>
            {" | "}Revenue: <strong className="text-slate-900">{formatCurrency.format(revenue)}</strong>
          </p>
          <SaveButton busy={status === "saving"}>Save dispatch</SaveButton>
        </div>
      </form>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {orders.map((order) => (
          <article key={order.CRM_Order_ID} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
            <div className="flex justify-between gap-3">
              <div><p className="font-bold text-slate-900">{order.Client_Name}</p><p className="text-xs text-slate-500">{order.Color}</p></div>
              <span className="text-sm font-black text-brand-700">{formatNumber.format(order.progress)}%</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-brand-600" style={{ width: `${Math.min(100, order.progress)}%` }} />
            </div>
            <p className="mt-3 text-xs text-slate-500">{formatNumber.format(order.dispatchedBlocks)} dispatched | {formatNumber.format(order.remainingBlocks)} remaining</p>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-panel">
        <div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>
            <th className="px-5 py-3">Date</th><th className="px-5 py-3">Client</th><th className="px-5 py-3">Color</th>
            <th className="px-5 py-3">Dispatch</th><th className="px-5 py-3">Transport</th><th className="px-5 py-3 text-right">Action</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data.Dispatch_Log.slice().reverse().map((row) => <tr key={row.Dispatch_ID || row._rowIndex}>
              <td className="px-5 py-4">{row.Date}</td><td className="px-5 py-4 font-semibold">{row.Client_Name}</td>
              <td className="px-5 py-4">{row.Color}</td><td className="px-5 py-4">{formatNumber.format(numberValue(row.Dispatch_Brass))} brass</td>
              <td className="px-5 py-4">{row.Transport_Type}</td><td className="px-5 py-4 text-right"><DeleteButton onClick={() => remove(row)} /></td>
            </tr>)}
            {!data.Dispatch_Log.length && <tr><td colSpan="6" className="px-5 py-10 text-center text-slate-500">No dispatch entries yet.</td></tr>}
          </tbody>
        </table></div>
      </section>
    </div>
  );
}
