import type { ExampleItem } from "../types";

type Props = {
  consoleOpen: boolean;
  examples: ExampleItem[];
  onExampleChange: (value: string) => void;
  onToggleConsole: () => void;
  selectedExampleFile: string;
};

export default function EditorToolbar({
  consoleOpen,
  examples,
  onExampleChange,
  onToggleConsole,
  selectedExampleFile,
}: Props) {
  return (
    <>
      <div className="editorToolbarGroup editorToolbarGroup--grow">
        <select
          value={selectedExampleFile}
          onChange={(event) => onExampleChange(event.target.value)}
          aria-label="Select CadQuery example"
        >
          {examples.length === 0 ? (
            <option value="">Examples unavailable</option>
          ) : (
            <>
              <option value="">Choose example</option>
              {examples.map((example) => (
                <option key={example.file} value={example.file}>
                  {example.title}
                </option>
              ))}
            </>
          )}
        </select>
      </div>
      <div className="editorToolbarGroup">
        <button type="button" onClick={onToggleConsole}>
          {consoleOpen ? "Hide Console" : "Show Console"}
        </button>
      </div>
    </>
  );
}
