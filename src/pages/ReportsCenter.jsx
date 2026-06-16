import { useCallback, useEffect, useMemo, useState } from "react";
import { Message, PageHeader } from "../components/WorkflowUI";
import { CLIENT_CONFIG } from "../lib/clientConfig";
import { REPORT_MODULES } from "../lib/constants";
import { normalizeText, todayInIndia } from "../lib/pageUtils";
import {
  buildReport,
  exportRowsToCsv,
  filterSheetsByDate,
  REPORT_SHEETS,
} from "../lib/reports";
import { syncFromSheets } from "../lib/sheets";
import { useAuth } from "../lib/authContext";
import {
  factoryLabel,
  filterSheetDataByFactory,
  useFactory,
} from "../lib/factories";

export default function ReportsCenter() {
  const { logout } = useAuth();
  const { selectedFactoryId } = useFactory();
  const [data, setData] = useState(
    Object.fromEntries(REPORT_SHEETS.map((sheetName) => [sheetName, []])),
  );
  const [module, setModule] = useState(REPORT_MODULES[0]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState(todayInIndia());
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setData(await syncFromSheets(REPORT_SHEETS));
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

  const report = useMemo(() => {
    const factoryData = filterSheetDataByFactory(data, selectedFactoryId);
    const datedData = filterSheetsByDate(factoryData, startDate, endDate);
    const built = buildReport(module, datedData);
    const query = normalizeText(search);
    return {
      ...built,
      rows: query
        ? built.rows.filter((row) =>
            Object.values(row).some((value) =>
              normalizeText(value).includes(query),
            ),
          )
        : built.rows,
    };
  }, [data, module, selectedFactoryId, startDate, endDate, search]);

  const exportCsv = () => {
    const filename = `${module.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}.csv`;
    exportRowsToCsv(filename, report.columns, report.rows);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={factoryLabel(selectedFactoryId)}
        title="Reports Center"
        description="Generate operational, inventory, sales, quality, workforce, cash, and financial reports."
      />
      <Message>{message}</Message>

      <section className="no-print rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label>
            <span className="mb-2 block text-xs font-bold uppercase text-slate-500">Module</span>
            <select
              value={module}
              onChange={(event) => setModule(event.target.value)}
              className="focus-ring w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"
            >
              {REPORT_MODULES.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-2 block text-xs font-bold uppercase text-slate-500">From</span>
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="focus-ring w-full rounded-xl border border-slate-200 px-3 py-3 text-sm" />
          </label>
          <label>
            <span className="mb-2 block text-xs font-bold uppercase text-slate-500">To</span>
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="focus-ring w-full rounded-xl border border-slate-200 px-3 py-3 text-sm" />
          </label>
          <label className="xl:col-span-2">
            <span className="mb-2 block text-xs font-bold uppercase text-slate-500">Search</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search report rows" className="focus-ring w-full rounded-xl border border-slate-200 px-3 py-3 text-sm" />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" onClick={load} disabled={status === "loading"} className="focus-ring rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
            {status === "loading" ? "Refreshing..." : "Refresh"}
          </button>
          <button type="button" onClick={exportCsv} className="focus-ring rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">
            CSV / Excel
          </button>
          <button type="button" onClick={() => window.print()} className="focus-ring rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">
            Print / PDF
          </button>
        </div>
      </section>

      <section className="report-document overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-panel">
        <header className="flex flex-col gap-3 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div>
            <p className="text-xs font-black tracking-[0.14em] text-brand-700">{CLIENT_CONFIG.appName}</p>
            <h2 className="mt-1 text-xl font-black text-slate-900">{module}</h2>
            <p className="mt-1 text-xs text-slate-500">{CLIENT_CONFIG.companyName}</p>
          </div>
          <div className="text-xs text-slate-500">
            {startDate || "All dates"} to {endDate || "Latest"} | {report.rows.length} rows
          </div>
        </header>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                {report.columns.map(([key, label]) => (
                  <th key={key} className="whitespace-nowrap px-4 py-3">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.rows.map((row, index) => (
                <tr key={row._rowIndex || `${module}-${index}`}>
                  {report.columns.map(([key]) => (
                    <td key={key} className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {row[key] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
              {!report.rows.length && (
                <tr>
                  <td colSpan={report.columns.length} className="px-5 py-12 text-center text-slate-500">
                    No report data matches the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <footer className="hidden border-t border-slate-200 px-6 py-4 text-xs text-slate-500 print:block">
          {CLIENT_CONFIG.poweredBy}
        </footer>
      </section>
    </div>
  );
}
