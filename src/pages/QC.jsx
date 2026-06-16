import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DeleteButton,
  Field,
  Message,
  NotesField,
  PageHeader,
  SaveButton,
} from "../components/WorkflowUI";
import { BLOCK_COLORS } from "../lib/constants";
import { calculateQcLoss } from "../lib/formulas";
import {
  formatCurrency,
  formatNumber,
  numberValue,
  todayInIndia,
} from "../lib/pageUtils";
import { appendRows, deleteRows, syncFromSheets } from "../lib/sheets";
import { useAuth } from "../lib/authContext";
import { useSessionFormState } from "../lib/useSessionFormState";

const SHEETS = ["QC_Log", "Production_Log"];
const emptyForm = () => ({
  date: todayInIndia(),
  color: BLOCK_COLORS[0],
  brokenBlocks: "",
  reason: "",
  notes: "",
});

function distributeBlocks(total) {
  const whole = Math.floor(total);
  const base = Math.floor(whole / BLOCK_COLORS.length);
  const remainder = whole % BLOCK_COLORS.length;
  return BLOCK_COLORS.map((color, index) => ({
    color,
    blocks: base + (index < remainder ? 1 : 0),
  })).filter(({ blocks }) => blocks > 0);
}

export default function QC() {
  const { user, logout } = useAuth();
  const [data, setData] = useState({ QC_Log: [], Production_Log: [] });
  const [form, setForm, resetForm] = useSessionFormState("qc", emptyForm);
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

  const latestCostPerBlock = useMemo(() => {
    const latest = data.Production_Log.slice().sort(
      (a, b) =>
        new Date(b.Created_At || b.Date || 0).getTime() -
        new Date(a.Created_At || a.Date || 0).getTime(),
    )[0];
    return numberValue(latest?.Cost_Per_Block);
  }, [data.Production_Log]);
  const brokenBlocks = numberValue(form.brokenBlocks);
  const qcLoss = calculateQcLoss(brokenBlocks, latestCostPerBlock);

  const groupedRows = useMemo(() => {
    const groups = new Map();
    data.QC_Log.forEach((row) => {
      const key = row.QC_Group_ID || row.QC_ID || `legacy-${row._rowIndex}`;
      const current = groups.get(key) || {
        id: key,
        date: row.Date,
        color: row.QC_Group_ID ? "" : row.Color,
        brokenBlocks: 0,
        qcLoss: 0,
        reason: row.Reason,
        rows: [],
      };
      current.rows.push(row);
      current.brokenBlocks += numberValue(row.Broken_Blocks ?? row.Broken_Quantity);
      current.qcLoss += numberValue(row.QC_Loss ?? row.Loss_Value);
      if (row.QC_Group_ID) current.color = "All Colors";
      groups.set(key, current);
    });
    return [...groups.values()].reverse();
  }, [data.QC_Log]);

  const onChange = ({ target }) =>
    setForm((current) => ({ ...current, [target.name]: target.value }));

  const save = async (event) => {
    event.preventDefault();
    if (brokenBlocks <= 0 || !form.reason.trim()) {
      setMessage("Enter broken blocks and a reason.");
      return;
    }
    if (latestCostPerBlock <= 0) {
      setMessage("Production costing is required before recording QC loss.");
      return;
    }

    setStatus("saving");
    const groupId = `QCG-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    const distributions =
      form.color === "All Colors"
        ? distributeBlocks(brokenBlocks)
        : [{ color: form.color, blocks: brokenBlocks }];

    try {
      const fresh = await appendRows(
        [
          ...distributions.map(({ color, blocks }) => ({
            sheetName: "QC_Log",
            row: {
              QC_ID: `QC-${crypto.randomUUID()}`,
              QC_Group_ID: form.color === "All Colors" ? groupId : "",
              Date: form.date,
              Color: color,
              Broken_Blocks: blocks,
              Cost_Per_Block: latestCostPerBlock,
              QC_Loss: calculateQcLoss(blocks, latestCostPerBlock),
              Reason: form.reason.trim(),
              Notes: form.notes.trim(),
              Created_At: timestamp,
            },
          })),
          {
            sheetName: "Activity_Log",
            row: {
              Timestamp: timestamp,
              Module: "QC",
              Action: "Created",
              Description: `${brokenBlocks} broken blocks recorded`,
              User_Email: user.email,
            },
          },
        ],
        [...SHEETS, "Opening_Stock", "Production_Variants", "Dispatch_Log"],
      );
      setData({ QC_Log: fresh.QC_Log, Production_Log: fresh.Production_Log });
      resetForm();
      setMessage("QC loss saved and finished stock refreshed.");
      setStatus("ready");
    } catch (error) {
      if ([401, 403].includes(error.status)) logout();
      else setMessage(error.message);
      setStatus("error");
    }
  };

  const remove = async (group) => {
    if (!window.confirm("Delete this QC entry and restore calculated stock?")) return;
    setStatus("saving");
    try {
      const fresh = await deleteRows(
        group.rows.map((row) => ({ sheetName: "QC_Log", rowIndex: row._rowIndex })),
        [...SHEETS, "Opening_Stock", "Production_Variants", "Dispatch_Log"],
      );
      await appendRows([{
        sheetName: "Activity_Log",
        row: {
          Timestamp: new Date().toISOString(), Module: "QC", Action: "Deleted",
          Description: `${group.brokenBlocks} broken blocks QC entry removed`, User_Email: user.email,
        },
      }]);
      setData({ QC_Log: fresh.QC_Log, Production_Log: fresh.Production_Log });
      setMessage("QC entry deleted and stock refreshed.");
      setStatus("ready");
    } catch (error) {
      if ([401, 403].includes(error.status)) logout();
      else setMessage(error.message);
      setStatus("error");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Quality control" title="QC" description="Record breakage and final loss without exposing internal costing logic." />
      <Message>{message}</Message>
      <form onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel sm:p-7">
        <h2 className="mb-5 text-lg font-bold text-slate-900">New QC entry</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Date" name="date" type="date" value={form.date} onChange={onChange} required />
          <Field label="Color" name="color" value={form.color} onChange={onChange}>
            {[...BLOCK_COLORS, "All Colors"].map((value) => <option key={value}>{value}</option>)}
          </Field>
          <Field label="Broken blocks" name="brokenBlocks" type="number" value={form.brokenBlocks} onChange={onChange} required />
          <Field label="Reason" name="reason" value={form.reason} onChange={onChange} required />
        </div>
        <div className="mt-4"><NotesField value={form.notes} onChange={onChange} /></div>
        <div className="mt-5 flex flex-col gap-4 rounded-2xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            Final QC loss: <strong className="text-slate-900">{formatCurrency.format(qcLoss)}</strong>
          </p>
          <SaveButton busy={status === "saving"}>Save QC entry</SaveButton>
        </div>
      </form>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-panel">
        <div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>
            <th className="px-5 py-3">Date</th><th className="px-5 py-3">Color</th><th className="px-5 py-3">Broken</th>
            <th className="px-5 py-3">Reason</th><th className="px-5 py-3">Loss</th><th className="px-5 py-3 text-right">Action</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {groupedRows.map((group) => <tr key={group.id}>
              <td className="px-5 py-4">{group.date}</td><td className="px-5 py-4 font-semibold">{group.color}</td>
              <td className="px-5 py-4">{formatNumber.format(group.brokenBlocks)}</td><td className="px-5 py-4">{group.reason}</td>
              <td className="px-5 py-4">{formatCurrency.format(group.qcLoss)}</td><td className="px-5 py-4 text-right"><DeleteButton onClick={() => remove(group)} /></td>
            </tr>)}
            {!groupedRows.length && <tr><td colSpan="6" className="px-5 py-10 text-center text-slate-500">No QC entries yet.</td></tr>}
          </tbody>
        </table></div>
      </section>
    </div>
  );
}
