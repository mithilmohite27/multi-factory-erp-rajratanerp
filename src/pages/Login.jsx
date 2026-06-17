import { GoogleLogin } from "@react-oauth/google";
import { CLIENT_CONFIG } from "../lib/clientConfig";
import { useAuth } from "../lib/authContext";
import { logoUrl } from "../lib/branding";
import { LANGUAGES, useI18n } from "../lib/i18n";

export default function Login() {
  const { login, status, authError } = useAuth();
  const { language, setLanguage, t } = useI18n();
  const clientConfigured = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);
  const isLocalhost = ["localhost", "127.0.0.1"].includes(
    window.location.hostname,
  );
  const isDenied = status === "denied";

  return (
    <main className="relative grid min-h-screen overflow-hidden bg-[#07110f] px-5 py-8 text-white lg:grid-cols-[1.12fr_0.88fr] lg:px-12">
      <div className="pointer-events-none absolute inset-0 opacity-55 [background-image:linear-gradient(rgba(255,255,255,0.026)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.026)_1px,transparent_1px)] [background-size:48px_48px]" />
      <div className="pointer-events-none absolute left-0 top-0 h-80 w-80 rounded-full bg-brand-500/10 blur-3xl" />
      <section className="relative flex flex-col justify-between border-white/10 lg:border-r lg:pr-16">
        <div className="flex items-center gap-4">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={CLIENT_CONFIG.companyName}
              className="h-16 w-16 rounded-2xl bg-white object-cover shadow-lg"
            />
          ) : (
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-lg font-black tracking-tight text-brand-900 shadow-lg ring-1 ring-white/70">
              {CLIENT_CONFIG.brandInitials}
            </span>
          )}
          <div>
            <p className="font-extrabold tracking-[0.16em]">
              {CLIENT_CONFIG.appName}
            </p>
            <p className="mt-1 text-sm text-white/55">{CLIENT_CONFIG.tagline}</p>
          </div>
        </div>

        <div className="my-16 max-w-2xl lg:my-10">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-sand-300">
            {t("login.heroEyebrow")}
          </p>
          <h1 className="mt-5 text-4xl font-black leading-tight tracking-tight sm:text-5xl xl:text-6xl">
            {t("login.heroTitle")}
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-white/55 sm:text-lg">
            {t("login.summary", { companyName: CLIENT_CONFIG.companyName })}
          </p>
          <div className="mt-7 grid max-w-xl gap-3 sm:grid-cols-3">
            {[
              ["3", t("login.statFactories")],
              ["30+", t("login.statWorkers")],
              ["EN / हिंदी", t("login.statLanguage")],
            ].map(([value, label]) => (
              <div
                key={label}
                className="rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3"
              >
                <p className="text-xl font-black">{value}</p>
                <p className="mt-1 text-xs text-white/40">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-white/40">
          {CLIENT_CONFIG.location || CLIENT_CONFIG.address} | {CLIENT_CONFIG.poweredBy}
        </p>
      </section>

      <section className="relative flex items-center justify-center py-12 lg:pl-16">
        <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.07] p-7 shadow-2xl shadow-black/30 backdrop-blur sm:p-9">
          <div className="mb-6 flex justify-end">
            <div className="flex rounded-full border border-white/10 bg-white/[0.06] p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => setLanguage(LANGUAGES.EN)}
                className={`rounded-full px-3 py-1.5 transition ${
                  language === LANGUAGES.EN
                    ? "bg-white text-brand-900"
                    : "text-white/55 hover:text-white"
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setLanguage(LANGUAGES.HI)}
                className={`rounded-full px-3 py-1.5 transition ${
                  language === LANGUAGES.HI
                    ? "bg-white text-brand-900"
                    : "text-white/55 hover:text-white"
                }`}
              >
                हिंदी
              </button>
            </div>
          </div>
          <div className="mb-8">
            <span className="inline-flex rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-200">
              {t("login.access")}
            </span>
            <h2 className="mt-5 text-2xl font-bold">{t("login.signIn")}</h2>
            <p className="mt-2 text-sm leading-6 text-white/50">
              {t("login.clientHint", { companyName: CLIENT_CONFIG.companyName })}
            </p>
          </div>

          {authError && (
            <div
              role="alert"
              className={`mb-6 rounded-2xl border px-4 py-3 text-sm leading-6 ${
                isDenied
                  ? "border-red-400/20 bg-red-400/10 text-red-100"
                  : "border-amber-300/20 bg-amber-300/10 text-amber-100"
              }`}
            >
              {authError}
            </div>
          )}

          {!clientConfigured ? (
            <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-4 text-sm text-amber-100">
              {t("login.configMissing")}
            </div>
          ) : (
            <div className="flex min-h-11 justify-center">
              <GoogleLogin
                onSuccess={({ credential }) => {
                  if (credential) login(credential).catch(() => {});
                }}
                onError={() => {}}
                useOneTap={false}
                auto_select={false}
                shape="pill"
                size="large"
                width="320"
                text="signin_with"
              />
            </div>
          )}

          <p className="mt-7 text-center text-xs leading-5 text-white/35">
            {t("login.accessLimited")}
            {isLocalhost ? t("login.localHint") : ""}
          </p>
        </div>
      </section>
    </main>
  );
}
