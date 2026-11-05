import { Dispatch, SetStateAction, useCallback, useEffect, useState } from "react";

// Слой хранения перенесён из Finzentra (hooks/useFinanceStore.ts): чтение с проверкой формата,
// запись в localStorage, защита от перезаписи повреждённых данных до первого изменения пользователем.

const LOAD_ERROR =
  "Не удалось загрузить часть сохраненных данных. Проверьте хранилище браузера перед продолжением работы.";
const SAVE_ERROR = "Не удалось сохранить изменения в хранилище браузера.";

type StoredValue<T> = { value: T; error?: string };

function readStored<T>(key: string, fallback: T, isValid: (value: unknown) => value is T): StoredValue<T> {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return { value: fallback };

    const parsed: unknown = JSON.parse(stored);
    if (!isValid(parsed)) {
      throw new Error("Stored value does not match the expected data format.");
    }
    return { value: parsed };
  } catch (error) {
    console.error(`Failed to load Finzentra data from "${key}".`, error);
    return { value: fallback, error: LOAD_ERROR };
  }
}

function writeStored(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Failed to save Finzentra data to "${key}".`, error);
    return false;
  }
}

export function usePersistentState<T>(key: string, fallback: T, isValid: (value: unknown) => value is T) {
  const [initial] = useState(() => readStored(key, fallback, isValid));
  const [value, setValueState] = useState<T>(initial.value);
  const [persistenceEnabled, setPersistenceEnabled] = useState(!initial.error);
  const [storageError, setStorageError] = useState<string | null>(initial.error ?? null);

  useEffect(() => {
    if (!persistenceEnabled) return;
    if (!writeStored(key, value)) setStorageError(SAVE_ERROR);
  }, [key, value, persistenceEnabled]);

  const setValue: Dispatch<SetStateAction<T>> = useCallback((next) => {
    setPersistenceEnabled(true);
    setValueState(next);
  }, []);

  return [value, setValue, storageError] as const;
}
