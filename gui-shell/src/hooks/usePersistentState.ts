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
  const serializeRef = useRef(options.serialize ?? defaultSerialize<T>);
  serializeRef.current = options.serialize ?? defaultSerialize<T>;

  const deserializeRef = useRef(options.deserialize ?? defaultDeserialize<T>);
  deserializeRef.current = options.deserialize ?? defaultDeserialize<T>;

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
