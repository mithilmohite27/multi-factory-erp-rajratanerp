const STORAGE_PREFIX = "multi-factory-erp";

const getStorageKey = (key) => `${STORAGE_PREFIX}:${key}`;

export const storage = Object.freeze({
  get(key, fallbackValue = null) {
    try {
      const value = window.localStorage.getItem(getStorageKey(key));
      return value === null ? fallbackValue : JSON.parse(value);
    } catch {
      return fallbackValue;
    }
  },
  set(key, value) {
    window.localStorage.setItem(getStorageKey(key), JSON.stringify(value));
  },
  remove(key) {
    window.localStorage.removeItem(getStorageKey(key));
  },
  clearAll() {
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith(`${STORAGE_PREFIX}:`))
      .forEach((key) => window.localStorage.removeItem(key));
  },
});
