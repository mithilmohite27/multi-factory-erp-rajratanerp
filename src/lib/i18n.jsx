/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, useState } from "react";

const LANGUAGE_KEY = "kalot-erp:language";

export const LANGUAGES = Object.freeze({
  EN: "en",
  HI: "hi",
});

const translations = {
  en: {
    "actions.cancel": "Cancel",
    "actions.delete": "Delete",
    "actions.export": "Export",
    "actions.filter": "Filter",
    "actions.refresh": "Refresh",
    "actions.save": "Save",
    "actions.saving": "Saving...",
    "actions.search": "Search",
    "actions.submit": "Submit",
    "app.factories": "Factories",
    "app.factoryView": "Factory view",
    "app.language": "Language",
    "app.loading": "Securing your workspace...",
    "app.logout": "Logout",
    "app.poweredBy": "Powered by Rajratan ERP",
    "app.role.superAdmin": "Super Admin",
    "app.role.factoryAdmin": "Factory Admin",
    "app.role.operator": "Operator",
    "app.role.supervisor": "Supervisor",
    "factories.all": "All factories",
    "groups.finance": "Finance",
    "groups.operations": "Operations",
    "groups.owner": "Owner",
    "groups.salesDispatch": "Sales & Dispatch",
    "login.access": "Secure ERP access",
    "login.accessLimited": "Access is limited to registered ERP users.",
    "login.clientHint": "Use the authorized Google account for {companyName}.",
    "login.configMissing":
      "Google Login is not configured. Add `VITE_GOOGLE_CLIENT_ID` to the environment.",
    "login.heroEyebrow": "Jaipur industrial operations",
    "login.heroTitle": "Factory control for paver block growth.",
    "login.localHint": " For local login, open http://localhost:5173.",
    "login.signIn": "Sign in to continue",
    "login.statFactories": "Factories",
    "login.statLanguage": "Language mode",
    "login.statWorkers": "Workers",
    "login.summary":
      "Production, inventory, dispatch, quality, finance, and workforce control for {companyName}.",
    "modules.bills-challans": "Bills & Challans",
    "modules.cash-register": "Cash Register",
    "modules.crm": "CRM",
    "modules.dashboard": "Dashboard",
    "modules.dispatch": "Dispatch",
    "modules.finished-block-inventory": "Finished Block Inventory",
    "modules.material-inventory": "Material Inventory",
    "modules.payroll": "Payroll",
    "modules.production-log": "Production Log",
    "modules.profit-loss": "P&L",
    "modules.qc": "QC",
    "modules.reports-center": "Reports Center",
    "modules.settings": "Settings",
    "modules.vendor-ledger": "Vendor Ledger",
    "dashboard.allFactoryPerformance": "All factory performance",
    "dashboard.cashBalance": "Cash Balance",
    "dashboard.currentStock": "Current Stock",
    "dashboard.emptyActivity": "No activity has been recorded yet.",
    "dashboard.factoryWiseControl": "Factory-wise control",
    "dashboard.latestUpdates": "Latest updates",
    "dashboard.liveDataError":
      "Live data could not be refreshed. Showing the latest available cache.",
    "dashboard.manageCompany": "Manage company",
    "dashboard.manageUserAccess": "Manage user access",
    "dashboard.netProfit": "Net Profit",
    "dashboard.ownerActions": "Owner actions",
    "dashboard.overview": "{factory} overview",
    "dashboard.payrollDue": "Payroll Due",
    "dashboard.pendingOrders": "Pending Orders",
    "dashboard.productionToday": "Production today",
    "dashboard.qcLoss": "QC Loss",
    "dashboard.quickActions": "Quick actions",
    "dashboard.recentActivity": "Recent activity",
    "dashboard.refresh": "Refresh dashboard",
    "dashboard.refreshing": "Refreshing...",
    "dashboard.revenueToday": "Revenue today",
    "dashboard.startEntry": "Start an entry",
    "dashboard.subtitle":
      "Current operational and financial outputs from the authorized company workbook.",
    "dashboard.todaysProduction": "Today's Production",
    "dashboard.todaysRevenue": "Today's Revenue",
    "dashboard.vendorOutstanding": "Vendor Outstanding",
    "dashboard.viewReports": "View reports",
    "quick.addProduction": "Add production",
    "quick.enterCashFlow": "Enter cash flow",
    "quick.newCrmEntry": "New CRM entry",
    "quick.recordDispatch": "Record dispatch",
  },
  hi: {
    "actions.cancel": "रद्द करें",
    "actions.delete": "हटाएं",
    "actions.export": "एक्सपोर्ट",
    "actions.filter": "फिल्टर",
    "actions.refresh": "रिफ्रेश",
    "actions.save": "सेव",
    "actions.saving": "सेव हो रहा है...",
    "actions.search": "खोजें",
    "actions.submit": "सबमिट",
    "app.factories": "फैक्ट्रियां",
    "app.factoryView": "फैक्ट्री व्यू",
    "app.language": "भाषा",
    "app.loading": "आपका वर्कस्पेस सुरक्षित किया जा रहा है...",
    "app.logout": "लॉगआउट",
    "app.poweredBy": "Powered by Rajratan ERP",
    "app.role.superAdmin": "सुपर एडमिन",
    "app.role.factoryAdmin": "फैक्ट्री एडमिन",
    "app.role.operator": "ऑपरेटर",
    "app.role.supervisor": "सुपरवाइजर",
    "factories.all": "सभी फैक्ट्रियां",
    "groups.finance": "फाइनेंस",
    "groups.operations": "ऑपरेशन्स",
    "groups.owner": "ओनर",
    "groups.salesDispatch": "सेल्स और डिस्पैच",
    "login.access": "सुरक्षित ERP एक्सेस",
    "login.accessLimited": "एक्सेस केवल रजिस्टर्ड ERP यूजर्स के लिए है.",
    "login.clientHint": "{companyName} के अधिकृत Google अकाउंट से लॉगिन करें.",
    "login.configMissing":
      "Google Login कॉन्फिगर नहीं है. Environment में `VITE_GOOGLE_CLIENT_ID` जोड़ें.",
    "login.heroEyebrow": "जयपुर इंडस्ट्रियल ऑपरेशन्स",
    "login.heroTitle": "पेवेर ब्लॉक फैक्ट्री के लिए पूरा कंट्रोल.",
    "login.localHint": " लोकल लॉगिन के लिए http://localhost:5173 खोलें.",
    "login.signIn": "लॉगिन करें",
    "login.statFactories": "फैक्ट्रियां",
    "login.statLanguage": "भाषा मोड",
    "login.statWorkers": "वर्कर्स",
    "login.summary":
      "{companyName} के लिए प्रोडक्शन, इन्वेंट्री, डिस्पैच, क्वालिटी, फाइनेंस और वर्कफोर्स कंट्रोल.",
    "modules.bills-challans": "बिल और चालान",
    "modules.cash-register": "कैश रजिस्टर",
    "modules.crm": "CRM",
    "modules.dashboard": "डैशबोर्ड",
    "modules.dispatch": "डिस्पैच",
    "modules.finished-block-inventory": "फिनिश्ड ब्लॉक स्टॉक",
    "modules.material-inventory": "मटेरियल स्टॉक",
    "modules.payroll": "पेरोल",
    "modules.production-log": "प्रोडक्शन लॉग",
    "modules.profit-loss": "P&L",
    "modules.qc": "QC",
    "modules.reports-center": "रिपोर्ट्स सेंटर",
    "modules.settings": "सेटिंग्स",
    "modules.vendor-ledger": "वेंडर लेजर",
    "dashboard.allFactoryPerformance": "सभी फैक्ट्रियों की परफॉर्मेंस",
    "dashboard.cashBalance": "कैश बैलेंस",
    "dashboard.currentStock": "करंट स्टॉक",
    "dashboard.emptyActivity": "अभी कोई एक्टिविटी रिकॉर्ड नहीं हुई है.",
    "dashboard.factoryWiseControl": "फैक्ट्री-वाइज कंट्रोल",
    "dashboard.latestUpdates": "लेटेस्ट अपडेट्स",
    "dashboard.liveDataError":
      "लाइव डेटा रिफ्रेश नहीं हो सका. उपलब्ध कैश दिखाया जा रहा है.",
    "dashboard.manageCompany": "कंपनी मैनेज करें",
    "dashboard.manageUserAccess": "यूजर एक्सेस मैनेज करें",
    "dashboard.netProfit": "नेट प्रॉफिट",
    "dashboard.ownerActions": "ओनर एक्शन",
    "dashboard.overview": "{factory} ओवरव्यू",
    "dashboard.payrollDue": "पेरोल बकाया",
    "dashboard.pendingOrders": "पेंडिंग ऑर्डर",
    "dashboard.productionToday": "आज का प्रोडक्शन",
    "dashboard.qcLoss": "QC लॉस",
    "dashboard.quickActions": "क्विक एक्शन",
    "dashboard.recentActivity": "रीसेंट एक्टिविटी",
    "dashboard.refresh": "डैशबोर्ड रिफ्रेश",
    "dashboard.refreshing": "रिफ्रेश हो रहा है...",
    "dashboard.revenueToday": "आज का रेवेन्यू",
    "dashboard.startEntry": "नई एंट्री शुरू करें",
    "dashboard.subtitle":
      "अधिकृत कंपनी वर्कबुक से मौजूदा ऑपरेशनल और फाइनेंशियल आउटपुट.",
    "dashboard.todaysProduction": "आज का प्रोडक्शन",
    "dashboard.todaysRevenue": "आज का रेवेन्यू",
    "dashboard.vendorOutstanding": "वेंडर बकाया",
    "dashboard.viewReports": "रिपोर्ट्स देखें",
    "quick.addProduction": "प्रोडक्शन जोड़ें",
    "quick.enterCashFlow": "कैश फ्लो एंट्री",
    "quick.newCrmEntry": "नई CRM एंट्री",
    "quick.recordDispatch": "डिस्पैच रिकॉर्ड करें",
  },
};

const LanguageContext = createContext(null);

function readStoredLanguage() {
  try {
    return localStorage.getItem(LANGUAGE_KEY) || LANGUAGES.EN;
  } catch {
    return LANGUAGES.EN;
  }
}

function interpolate(value, replacements = {}) {
  return Object.entries(replacements).reduce(
    (text, [key, replacement]) =>
      text.replaceAll(`{${key}}`, String(replacement ?? "")),
    value,
  );
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(readStoredLanguage);

  const setLanguage = (nextLanguage) => {
    const normalized =
      nextLanguage === LANGUAGES.HI ? LANGUAGES.HI : LANGUAGES.EN;
    setLanguageState(normalized);
    try {
      localStorage.setItem(LANGUAGE_KEY, normalized);
    } catch {
      // Ignore storage failures; the language still changes for this session.
    }
  };

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t(key, replacements) {
        const dictionary = translations[language] || translations.en;
        const translated = dictionary[key] || translations.en[key] || key;
        return interpolate(translated, replacements);
      },
    }),
    [language],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useI18n must be used within LanguageProvider.");
  return context;
}
