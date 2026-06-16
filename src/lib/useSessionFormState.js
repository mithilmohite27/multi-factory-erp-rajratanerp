import { useEffect, useState } from "react";

const FORM_STATE_PREFIX = "multi-factory-erp:form-state:";

function readFormState(key, createInitial) {
  try {
    const stored = window.sessionStorage.getItem(`${FORM_STATE_PREFIX}${key}`);
    return stored ? JSON.parse(stored) : createInitial();
  } catch {
    return createInitial();
  }
}

export function useSessionFormState(key, createInitial) {
  const [form, setForm] = useState(() => readFormState(key, createInitial));

  useEffect(() => {
    window.sessionStorage.setItem(
      `${FORM_STATE_PREFIX}${key}`,
      JSON.stringify(form),
    );
  }, [form, key]);

  const resetForm = () => {
    window.sessionStorage.removeItem(`${FORM_STATE_PREFIX}${key}`);
    setForm(createInitial());
  };

  return [form, setForm, resetForm];
}
