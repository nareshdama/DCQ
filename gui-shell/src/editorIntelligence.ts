import type { Completion } from "@codemirror/autocomplete";
import completionCatalog from "./cq-completions.json";

type CompletionEntry = {
  label: string;
  type?: string;
  detail?: string;
  info?: string;
};

type CompletionCatalog = {
  namespace: CompletionEntry[];
  workplane: string[];
  assembly: string[];
  selectors: CompletionEntry[];
  planes: CompletionEntry[];
  parameters: CompletionEntry[];
  workplaneSummaries: Record<string, string>;
  assemblySummaries: Record<string, string>;
};

const catalog = completionCatalog as CompletionCatalog;

function buildMethodEntries(
  labels: string[],
  detail: string,
  summaries: Record<string, string>,
  fallbackInfo: string
): Completion[] {
  return labels.map((label) => ({
    label,
    type: "method",
    detail,
    info: summaries[label] ?? fallbackInfo,
  }));
}

function escapeForRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const workplaneEntries = buildMethodEntries(
  catalog.workplane,
  "Workplane",
  catalog.workplaneSummaries,
  "CadQuery Workplane method."
);

const assemblyEntries = buildMethodEntries(
  catalog.assembly,
  "Assembly",
  catalog.assemblySummaries,
  "CadQuery Assembly method."
);

export const cadQueryCompletions = {
  namespace: catalog.namespace as Completion[],
  workplane: workplaneEntries,
  assembly: assemblyEntries,
  selectors: catalog.selectors as Completion[],
  planes: catalog.planes as Completion[],
  parameters: catalog.parameters as Completion[],
} as const;

const workplaneMethodPattern = catalog.workplane.map(escapeForRegex).join("|");
const assemblyMethodPattern = catalog.assembly.map(escapeForRegex).join("|");

const workplaneObjectPattern = new RegExp(
  String.raw`(?:\bcq\.Workplane\([^\n]*\)|\b(?:result|wp|part|profile|solid|body)\b)(?:(?:\.(?:${workplaneMethodPattern})\([^\n]*\))*)\.[A-Za-z_]*$`
);

const assemblyObjectPattern = new RegExp(
  String.raw`(?:\bcq\.Assembly\([^\n]*\)|\b(?:assembly|assy)\b)(?:(?:\.(?:${assemblyMethodPattern})\([^\n]*\))*)\.[A-Za-z_]*$`
);

const workplaneContinuationPattern = new RegExp(
  String.raw`^\s*(?:\.(?:${workplaneMethodPattern})\([^\n]*\))+\.[A-Za-z_]*$`
);

const assemblyContinuationPattern = new RegExp(
  String.raw`^\s*(?:\.(?:${assemblyMethodPattern})\([^\n]*\))+\.[A-Za-z_]*$`
);

const namespacePattern = /\bcq\.[A-Za-z_]*$/;
const selectorPattern = /\.(?:faces|edges|vertices|wires|solids|shells)\(\s*["'][^"'()\n]*$/;
const planePattern = /(?:\bcq\.Workplane|\.mirror)\(\s*["'][^"'()\n]*$/;
const parameterPattern = /(?:\(|,)\s*[A-Za-z_][\w=]*$/;

export type CadQueryCompletionKind =
  | "namespace"
  | "workplane"
  | "assembly"
  | "selectors"
  | "planes"
  | "parameters"
  | null;

export function getCadQueryCompletionKind(
  linePrefix: string,
  explicit: boolean
): CadQueryCompletionKind {
  if (selectorPattern.test(linePrefix)) {
    return "selectors";
  }
  if (planePattern.test(linePrefix)) {
    return "planes";
  }
  if (namespacePattern.test(linePrefix)) {
    return "namespace";
  }
  if (assemblyObjectPattern.test(linePrefix) || assemblyContinuationPattern.test(linePrefix)) {
    return "assembly";
  }
  if (workplaneObjectPattern.test(linePrefix) || workplaneContinuationPattern.test(linePrefix)) {
    return "workplane";
  }
  if (
    explicit &&
    parameterPattern.test(linePrefix) &&
    (linePrefix.includes("cq.") || linePrefix.includes("result") || linePrefix.includes("."))
  ) {
    return "parameters";
  }
  return null;
}

export function getStringCompletionFrom(linePrefix: string, lineFrom: number) {
  const singleQuote = linePrefix.lastIndexOf("'");
  const doubleQuote = linePrefix.lastIndexOf("\"");
  const quoteIndex = Math.max(singleQuote, doubleQuote);
  return quoteIndex >= 0 ? lineFrom + quoteIndex + 1 : lineFrom;
}

export const PARAMETER_PATTERN = /^(\w+)\s*=\s*(-?(?:\d+(?:\.\d*)?|\.\d+))\s*(?:#.*)?$/;
const PARAMETER_LINE_PATTERN =
  /^(\w+)(\s*=\s*)(-?(?:\d+(?:\.\d*)?|\.\d+))(\s*(?:#.*)?)$/;

export type ScriptParameter = {
  name: string;
  value: number;
  initialValue: number;
  rawValue: string;
  lineNumber: number;
  precision: number;
};

function fractionDigits(value: string) {
  const [, fractional = ""] = value.split(".");
  return fractional.length;
}

function precisionFor(parameter: ScriptParameter, nextValue: number) {
  if (Number.isInteger(nextValue)) {
    return parameter.precision;
  }
  const nextText = String(nextValue);
  return Math.min(
    4,
    Math.max(parameter.precision, fractionDigits(nextText))
  );
}

export function formatParameterValue(
  parameter: ScriptParameter,
  nextValue: number
) {
  const precision = precisionFor(parameter, nextValue);
  return precision > 0 ? nextValue.toFixed(precision) : String(Math.round(nextValue));
}

export function getScriptParameterKey(parameter: ScriptParameter) {
  return `${parameter.lineNumber}:${parameter.name}`;
}

export function detectScriptParameters(
  script: string,
  previous: ScriptParameter[] = []
) {
  const previousByName = new Map(previous.map((parameter) => [parameter.name, parameter]));

  return script
    .split(/\r?\n/)
    .map((lineText, index) => {
      if (/^\s/.test(lineText)) {
        return null;
      }
      const match = PARAMETER_PATTERN.exec(lineText);
      if (!match) {
        return null;
      }
      const [, name, rawValue] = match;
      const value = Number(rawValue);
      if (!Number.isFinite(value)) {
        return null;
      }

      const previousParameter = previousByName.get(name);
      return {
        name,
        value,
        initialValue: previousParameter?.initialValue ?? value,
        rawValue,
        lineNumber: index + 1,
        precision: Math.max(previousParameter?.precision ?? 0, fractionDigits(rawValue)),
      } satisfies ScriptParameter;
    })
    .filter((parameter): parameter is ScriptParameter => parameter != null);
}

export function replaceParameterAssignment(
  lineText: string,
  parameter: ScriptParameter,
  nextValue: number
) {
  const match = PARAMETER_LINE_PATTERN.exec(lineText);
  if (!match || match[1] !== parameter.name) {
    return null;
  }
  return `${match[1]}${match[2]}${formatParameterValue(parameter, nextValue)}${match[4] ?? ""}`;
}

export function updateParameterInScript(
  script: string,
  parameter: ScriptParameter,
  nextValue: number
) {
  const lines = script.split(/\r?\n/);
  const lineIndex = parameter.lineNumber - 1;
  if (lineIndex < 0 || lineIndex >= lines.length) {
    return script;
  }
  const nextLine = replaceParameterAssignment(lines[lineIndex], parameter, nextValue);
  if (!nextLine) {
    return script;
  }
  lines[lineIndex] = nextLine;
  return lines.join("\n");
}

export function getParameterRange(parameter: ScriptParameter) {
  const basis = Math.max(
    1,
    Math.abs(parameter.initialValue),
    Math.abs(parameter.value)
  );
  const usesNegativeRange = parameter.initialValue < 0 || parameter.value < 0;
  const max = Number((basis * 3).toFixed(4));
  const min = usesNegativeRange ? -max : 0;
  const step =
    parameter.precision > 0
      ? Number((1 / 10 ** Math.min(parameter.precision, 4)).toFixed(Math.min(parameter.precision, 4)))
      : basis >= 100
        ? 1
        : basis >= 10
          ? 0.5
          : basis >= 1
            ? 0.1
            : 0.01;

  return { min, max, step };
}
