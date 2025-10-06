import { useCallback, useEffect, useRef, useState } from "react";

type Reviver = (value: unknown) => unknown;

function parseJSON<T>(value: string | null, reviver?: Reviver): T | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value, reviver);
    return parsed ?? undefined;
  } catch (error) {
    console.warn("[useLocalStorage] Failed to parse JSON", error);
    return undefined;
  }
}

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export interface UseLocalStorageOptions<T> {
  reviver?: Reviver;
  serializer?: (value: T) => string;
  deserializer?: (value: string) => T;
  storage?: Storage;
  listenToStorage?: boolean;
}

export function useLocalStorage<T>(key: string, initialValue: T, options: UseLocalStorageOptions<T> = {}) {
  const {
    reviver,
    serializer,
    deserializer,
    storage = isBrowser() ? window.localStorage : undefined,
    listenToStorage = true,
  } = options;

  const [state, setState] = useState<T>(() => {
    if (!storage) return initialValue;
    const storedValue = storage.getItem(key);
    const parsed = deserializer
      ? storedValue != null
        ? deserializer(storedValue)
        : undefined
      : parseJSON<T>(storedValue, reviver);
    return parsed !== undefined ? parsed : initialValue;
  });

  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!storage) return;
    try {
      const serialized = serializer ? serializer(stateRef.current) : JSON.stringify(stateRef.current);
      storage.setItem(key, serialized);
    } catch (error) {
      console.warn("[useLocalStorage] Failed to serialize value", error);
    }
  }, [key, serializer, storage, state]);

  useEffect(() => {
    if (!storage || !listenToStorage) return;
    const handler = (event: StorageEvent) => {
      if (event.storageArea === storage && event.key === key) {
        const newValue = deserializer
          ? event.newValue != null
            ? deserializer(event.newValue)
            : undefined
          : parseJSON<T>(event.newValue, reviver);
        if (newValue !== undefined) {
          setState(newValue);
        }
      }
    };

    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [key, storage, deserializer, listenToStorage, reviver]);

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setState((prev) => (typeof value === "function" ? (value as (prev: T) => T)(prev) : value));
    },
    []
  );

  const remove = useCallback(() => {
    if (!storage) return;
    storage.removeItem(key);
  }, [key, storage]);

  return [state, setValue, remove] as const;
}
