import { useCallback, useEffect, useRef, useState } from "react";
import { getExampleCode, getExamplesIndex } from "../api";
import type { ExampleItem } from "../types";

function sanitizeExampleTitle(title: string, file: string) {
  const fallback = file.replace(/\.py$/i, "");
  const cleaned = title.replace(/\uf0c1/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || fallback;
}

export function useExamples(active = false) {
  const [examples, setExamples] = useState<ExampleItem[]>([]);
  const [examplesError, setExamplesError] = useState<string | null>(null);
  const [examplesLoading, setExamplesLoading] = useState(true);
  const [selectedExampleFile, setSelectedExampleFile] = useState("");
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!active || fetchedRef.current) return;
    fetchedRef.current = true;

    let cancelled = false;
    setExamplesLoading(true);

    void (async () => {
      try {
        const index = await getExamplesIndex();
        if (cancelled) return;

        const nextExamples = (index.examples ?? []).map((example) => ({
          ...example,
          title: sanitizeExampleTitle(example.title, example.file),
        }));
        setExamples(nextExamples);
        setExamplesError(null);
      } catch {
        if (!cancelled) {
          setExamples([]);
          setExamplesError("Failed to load examples. Is the server running?");
        }
      } finally {
        if (!cancelled) setExamplesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [active]);

  const loadSelectedExample = useCallback(async (fileName?: string) => {
    const targetFile = fileName ?? selectedExampleFile;
    if (!targetFile) {
      return null;
    }
    return getExampleCode(targetFile);
  }, [selectedExampleFile]);

  return {
    examples,
    examplesError,
    examplesLoading,
    loadSelectedExample,
    selectedExampleFile,
    setSelectedExampleFile,
  };
}
