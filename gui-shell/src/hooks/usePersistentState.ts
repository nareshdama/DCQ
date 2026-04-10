import { useEffect, useRef, useState } from "react";

type InitialValue<T> = T | (() => T);
type Options<T> = {
  deserialize?: (value: string) => T;
  serialize?: (value: T) => string;
};

const defaultDeserialize = <T,>(value: string) => JSON.parse(value) as T;
const defaultSerialize = <T,>(value: T) => JSON.stringify(value);

function resolveInitialValue<T>(value: InitialValue<T>) {
  return typeof value === "function" ? (value as () => T)() : value;
}

export function usePersistentState<T>(
  key: string,
  initialValue: InitialValue<T>,
  options: Options<T> = {}
) {
  const deserialize = options.deserialize ?? defaultDeserialize<T>;
  const serialize = options.serialize ?? defaultSerialize<T>;

  // Stable refs so the effect only re-runs when key or value changes,
  // not when the caller re-creates the options object on every render.
  const serializeRef = useRef(serialize);
  const deserializeRef = useRef(deserialize);
  serializeRef.current = serialize;
  deserializeRef.current = deserialize;

  const [value, setValue] = useState<T>(() => {
    const fallback = resolveInitialValue(initialValue);
    if (typeof window === "undefined") {
      return fallback;
    }

    const savedValue = window.localStorage.getItem(key);
    if (savedValue === null) {
      return fallback;
    }

    try {
      return deserializeRef.current(savedValue);
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(key, serializeRef.current(value));
  }, [key, value]);

  return [value, setValue] as const;
}
