import { Terminal } from "lucide-react";

type Props = {
  consoleOpen: boolean;
  onToggleConsole: () => void;
};

export default function EditorToolbar({
  consoleOpen,
  onToggleConsole,
}: Props) {
  return (
    <div className="editorToolbarGroup">
      <button
        type="button"
        onClick={onToggleConsole}
        title={consoleOpen ? "Hide Console" : "Show Console"}
        aria-pressed={consoleOpen}
      >
        <Terminal size={13} strokeWidth={1.5} />
        {consoleOpen ? "Hide Console" : "Console"}
      </button>
    </div>
  );
}
