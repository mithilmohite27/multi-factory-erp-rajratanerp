import { useI18n } from "../lib/i18n";

export function PageHeader({ eyebrow, title, description }) {
  return (
    <section className="rounded-3xl bg-brand-900 px-6 py-7 text-white shadow-panel sm:px-8">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-sand-300">
        {eyebrow}
      </p>
      <h1 className="mt-2 text-2xl font-black sm:text-3xl">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm text-white/55">{description}</p>
    </section>
  );
}

export function Message({ children }) {
  if (!children) return null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-panel">
      {children}
    </div>
  );
}

export function Field({
  label,
  name,
  value,
  onChange,
  type = "text",
  children,
  ...props
}) {
  const className =
    "focus-ring w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900";

  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children ? (
        <select
          name={name}
          value={value}
          onChange={onChange}
          className={className}
          {...props}
        >
          {children}
        </select>
      ) : (
        <input
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          min={type === "number" ? "0" : undefined}
          step={type === "number" ? "any" : undefined}
          className={className}
          {...props}
        />
      )}
    </label>
  );
}

export function NotesField({ value, onChange }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">
        Notes
      </span>
      <textarea
        name="notes"
        value={value}
        onChange={onChange}
        rows="3"
        className="focus-ring w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm"
      />
    </label>
  );
}

export function SaveButton({ busy, children = "Save" }) {
  const { t } = useI18n();

  return (
    <button
      type="submit"
      disabled={busy}
      className="focus-ring rounded-xl bg-brand-700 px-5 py-3 text-sm font-bold text-white hover:bg-brand-800 disabled:opacity-60"
    >
      {busy ? t("actions.saving") : children === "Save" ? t("actions.save") : children}
    </button>
  );
}

export function DeleteButton({ onClick }) {
  const { t } = useI18n();

  return (
    <button
      type="button"
      onClick={onClick}
      className="focus-ring rounded-lg px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50"
    >
      {t("actions.delete")}
    </button>
  );
}
