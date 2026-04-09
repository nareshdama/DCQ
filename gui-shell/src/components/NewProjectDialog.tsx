import { useCallback, useEffect, useRef, useState } from "react";
import { FolderPlus, X } from "lucide-react";

type Props = {
  onConfirm: (name: string) => void;
  onCancel: () => void;
};

const FORBIDDEN_CHARS = /[<>:"/\\|?*]/g;
const MAX_NAME_LENGTH = 64;

export default function NewProjectDialog({ onConfirm, onCancel }: Props) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const validate = useCallback((value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return "Project name cannot be empty";
    if (FORBIDDEN_CHARS.test(trimmed)) return 'Name cannot contain < > : " / \\ | ? *';
    if (trimmed.length > MAX_NAME_LENGTH) return `Name must be ${MAX_NAME_LENGTH} characters or less`;
    if (trimmed.startsWith(".")) return "Name cannot start with a dot";
    return null;
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = name.trim();
    const validationError = validate(trimmed);
    if (validationError) {
      setError(validationError);
      return;
    }
    onConfirm(trimmed);
  }, [name, validate, onConfirm]);

  return (
    <>
      <div className="newProjectBackdrop" onClick={onCancel} />
      <div className="newProjectDialog" role="dialog" aria-modal="true" aria-label="New Project">
        <div className="newProjectHeader">
          <div className="newProjectHeaderTitle">
            <FolderPlus size={16} strokeWidth={1.5} />
            <h3>New Project</h3>
          </div>
          <button
            type="button"
            className="newProjectCloseBtn"
            onClick={onCancel}
            aria-label="Cancel"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        <div className="newProjectBody">
          <label className="newProjectLabel" htmlFor="new-project-name">
            Project name
          </label>
          <input
            ref={inputRef}
            id="new-project-name"
            className={`newProjectInput ${error ? "newProjectInput--error" : ""}`}
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
            placeholder="e.g. Bearing Pillow Block"
            maxLength={MAX_NAME_LENGTH}
            autoComplete="off"
            spellCheck={false}
          />
          {error ? <p className="newProjectError">{error}</p> : null}
          <p className="newProjectHint">
            Creates a folder in ~/DCQ-Projects/ with a starter script.
          </p>
        </div>

        <div className="newProjectFooter">
          <button
            type="button"
            className="newProjectCancelBtn"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="newProjectCreateBtn"
            onClick={handleSubmit}
            disabled={!name.trim()}
          >
            Create Project
          </button>
        </div>
      </div>
    </>
  );
}
