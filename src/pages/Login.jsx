import { GoogleLogin } from "@react-oauth/google";
import { CLIENT_CONFIG } from "../lib/clientConfig";
import { useAuth } from "../lib/authContext";
import { logoUrl } from "../lib/branding";

export default function Login() {
  const { login, status, authError } = useAuth();
  const clientConfigured = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);
  const isDenied = status === "denied";

  return (
    <main className="relative grid min-h-screen overflow-hidden bg-[#07110f] px-5 py-10 text-white lg:grid-cols-[1.15fr_0.85fr] lg:px-12">
      <div className="pointer-events-none absolute inset-0 opacity-50 [background-image:linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] [background-size:48px_48px]" />
      <section className="relative flex flex-col justify-between border-white/10 lg:border-r lg:pr-16">
        <div className="flex items-center gap-4">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={CLIENT_CONFIG.companyName}
              className="h-16 w-16 rounded-2xl bg-white object-cover shadow-lg"
            />
          ) : (
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-lg font-black text-brand-800 shadow-lg">
              {CLIENT_CONFIG.brandInitials}
            </span>
          )}
          <div>
            <p className="font-extrabold tracking-[0.12em]">
              {CLIENT_CONFIG.appName}
            </p>
            <p className="mt-1 text-sm text-white/55">{CLIENT_CONFIG.tagline}</p>
          </div>
        </div>

        <div className="my-16 max-w-2xl lg:my-10">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-sand-300">
            Industrial operations
          </p>
          <h1 className="mt-5 text-4xl font-black leading-tight tracking-tight sm:text-5xl xl:text-6xl">
            One secure view of all factories.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-white/55 sm:text-lg">
            Production, inventory, dispatch, quality, finance, and workforce
            control for {CLIENT_CONFIG.companyName}.
          </p>
        </div>

        <p className="text-xs text-white/40">{CLIENT_CONFIG.poweredBy}</p>
      </section>

      <section className="relative flex items-center justify-center py-12 lg:pl-16">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.06] p-7 shadow-2xl shadow-black/30 backdrop-blur sm:p-9">
          <div className="mb-8">
            <span className="inline-flex rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-200">
              Admin access
            </span>
            <h2 className="mt-5 text-2xl font-bold">Sign in to continue</h2>
            <p className="mt-2 text-sm leading-6 text-white/50">
              Use the authorized Google account for {CLIENT_CONFIG.companyName}.
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
              Google Login is not configured. Add `VITE_GOOGLE_CLIENT_ID` to the
              environment.
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
            Access is limited to registered ERP users. For local login, open
            http://localhost:5173.
          </p>
        </div>
      </section>
    </main>
  );
}
