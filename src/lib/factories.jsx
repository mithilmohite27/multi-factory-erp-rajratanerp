/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { MODULES } from "./constants";
import { useAuth } from "./authContext";

const FACTORY_SELECTION_KEY = "multi-factory-erp:selected-factory";

export const ALL_FACTORY_ID = "all";

export const FACTORIES = Object.freeze([
  { id: "factory-1", name: "Factory 1", shortName: "F1", location: "Unit 1" },
  { id: "factory-2", name: "Factory 2", shortName: "F2", location: "Unit 2" },
  { id: "factory-3", name: "Factory 3", shortName: "F3", location: "Unit 3" },
]);

export const ROLES = Object.freeze({
  SUPER_ADMIN: "Super Admin",
  FACTORY_ADMIN: "Factory Admin",
  SUPERVISOR: "Supervisor",
  OPERATOR: "Operator",
});

const ROLE_DEFAULT_MODULES = Object.freeze({
  [ROLES.SUPER_ADMIN]: ["dashboard", "reports-center", "settings"],
  [ROLES.FACTORY_ADMIN]: MODULES.map((module) => module.key).filter(
    (key) => key !== "settings",
  ),
  [ROLES.SUPERVISOR]: [
    "dashboard",
    "production-log",
    "material-inventory",
    "finished-block-inventory",
    "crm",
    "dispatch",
    "qc",
    "reports-center",
  ],
  [ROLES.OPERATOR]: [
    "dashboard",
    "production-log",
    "dispatch",
    "qc",
    "reports-center",
  ],
});

const FactoryContext = createContext(null);

export function normalizeRole(role) {
  const value = String(role || "").trim().toLowerCase();
  if (["owner", "admin", "super admin", "super_admin"].includes(value)) {
    return ROLES.SUPER_ADMIN;
  }
  if (["factory admin", "factory_admin"].includes(value)) {
    return ROLES.FACTORY_ADMIN;
  }
  if (value === "supervisor") return ROLES.SUPERVISOR;
  if (value === "operator") return ROLES.OPERATOR;
  return ROLES.SUPER_ADMIN;
}

export function isSuperAdmin(user) {
  return normalizeRole(user?.role) === ROLES.SUPER_ADMIN;
}

export function getFactoryById(factoryId) {
  return FACTORIES.find((factory) => factory.id === factoryId) || FACTORIES[0];
}

export function getUserFactoryIds(user) {
  if (isSuperAdmin(user)) return FACTORIES.map((factory) => factory.id);
  const assigned = Array.isArray(user?.factoryIds)
    ? user.factoryIds
    : String(user?.factoryId || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
  return assigned.filter((factoryId) =>
    FACTORIES.some((factory) => factory.id === factoryId),
  );
}

export function getAccessibleFactories(user) {
  const factoryIds = getUserFactoryIds(user);
  return FACTORIES.filter((factory) => factoryIds.includes(factory.id));
}

export function getModuleKeysForUser(user) {
  const role = normalizeRole(user?.role);
  if (role === ROLES.SUPER_ADMIN) {
    return new Set(ROLE_DEFAULT_MODULES[ROLES.SUPER_ADMIN]);
  }
  const moduleKeys = Array.isArray(user?.permissions)
    ? user.permissions.length
      ? user.permissions
      : ROLE_DEFAULT_MODULES[role]
    : ROLE_DEFAULT_MODULES[role] || ROLE_DEFAULT_MODULES[ROLES.SUPER_ADMIN];
  return new Set(moduleKeys);
}

export function canAccessModule(user, moduleKey) {
  return getModuleKeysForUser(user).has(moduleKey);
}

export function getPreferredFactoryId(user) {
  if (isSuperAdmin(user)) {
    return window.sessionStorage.getItem(FACTORY_SELECTION_KEY) || ALL_FACTORY_ID;
  }
  return getUserFactoryIds(user)[0] || FACTORIES[0].id;
}

export function rowFactoryId(row) {
  return row?.Factory_ID || row?.factoryId || row?.FactoryId || "";
}

export function filterRowsByFactory(rows, factoryId) {
  if (!Array.isArray(rows)) return [];
  if (!factoryId || factoryId === ALL_FACTORY_ID) return rows;
  return rows.filter((row) => {
    const value = rowFactoryId(row);
    return !value || value === factoryId;
  });
}

export function filterSheetDataByFactory(data, factoryId) {
  return Object.fromEntries(
    Object.entries(data || {}).map(([sheetName, rows]) => [
      sheetName,
      filterRowsByFactory(rows, factoryId),
    ]),
  );
}

export function withFactoryFields(row, factoryId) {
  return {
    Factory_ID: factoryId,
    ...row,
  };
}

export function factoryLabel(factoryId) {
  if (factoryId === ALL_FACTORY_ID) return "All factories";
  return getFactoryById(factoryId).name;
}

export function FactoryProvider({ children }) {
  const { user } = useAuth();
  const accessibleFactories = useMemo(() => getAccessibleFactories(user), [user]);
  const [selectedFactoryId, setSelectedFactoryId] = useState(() =>
    getPreferredFactoryId(user),
  );

  useEffect(() => {
    const validIds = [
      ...(isSuperAdmin(user) ? [ALL_FACTORY_ID] : []),
      ...accessibleFactories.map((factory) => factory.id),
    ];
    if (!validIds.includes(selectedFactoryId)) {
      setSelectedFactoryId(validIds[0] || FACTORIES[0].id);
    }
  }, [accessibleFactories, selectedFactoryId, user]);

  const setFactoryId = useCallback((factoryId) => {
    setSelectedFactoryId(factoryId);
    window.sessionStorage.setItem(FACTORY_SELECTION_KEY, factoryId);
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem(FACTORY_SELECTION_KEY, selectedFactoryId);
  }, [selectedFactoryId]);

  const value = useMemo(
    () => ({
      accessibleFactories,
      allFactories: FACTORIES,
      selectedFactoryId,
      selectedFactory:
        selectedFactoryId === ALL_FACTORY_ID
          ? null
          : getFactoryById(selectedFactoryId),
      canSeeAllFactories: isSuperAdmin(user),
      setFactoryId,
    }),
    [accessibleFactories, selectedFactoryId, setFactoryId, user],
  );

  return (
    <FactoryContext.Provider value={value}>{children}</FactoryContext.Provider>
  );
}

export function useFactory() {
  const context = useContext(FactoryContext);
  if (!context) throw new Error("useFactory must be used within FactoryProvider.");
  return context;
}
