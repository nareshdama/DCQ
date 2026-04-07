export type Diagnostic = {
  line: number;
  message: string;
};

export type ExportFormat = "stl" | "step";

export type RunTrigger = "manual" | "live";

export type StatusTone =
  | "neutral"
  | "info"
  | "progress"
  | "success"
  | "danger";

export type UiStatus = {
  label: string;
  tone: StatusTone;
};

export type RunResponse = {
  ok: boolean;
  stderr: string;
  stdout: string;
  exports?: {
    stl?: string;
    step?: string;
  };
  diagnostics?: Diagnostic[];
};

export type ExampleItem = {
  id: number;
  title: string;
  file: string;
};

export type ExamplesIndexResponse = {
  name: string;
  count: number;
  source?: string;
  examples: ExampleItem[];
};
