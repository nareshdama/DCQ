type Props = {
  consoleOpen: boolean;
  onToggleConsole: () => void;
};

export default function EditorToolbar({
  consoleOpen,
  onToggleConsole,
}: Props) {
  return (
    <>
      <div className="editorToolbarGroup editorToolbarGroup--grow" />
      <div className="editorToolbarGroup">
        <button type="button" onClick={onToggleConsole}>
          {consoleOpen ? "Hide Console" : "Show Console"}
        </button>
      </div>
    </>
  );
}
