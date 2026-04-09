import { useEffect, useRef, useState, useMemo } from "react";
import { Search, ArrowRight } from "lucide-react";

type Action = {
  id: string;
  title: string;
  shortcut?: string;
  handler: () => void;
  category?: string;
};

type Props = {
  actions: Action[];
  onClose: () => void;
};

export default function CommandPalette({ actions, onClose }: Props) {
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredActions = useMemo(() => {
    if (!search.trim()) return actions;
    const query = search.toLowerCase();
    return actions.filter(
      (a) =>
        a.title.toLowerCase().includes(query) ||
        a.category?.toLowerCase().includes(query)
    );
  }, [actions, search]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((i) => (i + 1) % Math.max(1, filteredActions.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex(
        (i) => (i - 1 + filteredActions.length) % Math.max(1, filteredActions.length)
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const action = filteredActions[selectedIndex];
      if (action) {
        action.handler();
        onClose();
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <div className="paletteBackdrop" onClick={onClose} role="presentation">
      <div
        className="palette"
        role="dialog"
        aria-label="Command palette"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="paletteSearch">
          <Search size={20} color="var(--text-tertiary)" strokeWidth={1.5} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search commands…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search commands"
          />
        </div>
        <div className="paletteResults" role="listbox" aria-label="Command results">
          {filteredActions.length === 0 ? (
            <div className="paletteEmpty">No commands found</div>
          ) : (
            filteredActions.map((action, index) => (
              <div
                key={action.id}
                role="option"
                aria-selected={index === selectedIndex}
                className={`paletteItem ${
                  index === selectedIndex ? "paletteItem--active" : ""
                }`}
                onClick={() => {
                  action.handler();
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="paletteItemTitle">
                  {action.category && (
                    <span className="paletteItemCategory">{action.category}</span>
                  )}
                  {action.title}
                </div>
                {action.shortcut ? (
                  <div className="paletteItemShortcut">{action.shortcut}</div>
                ) : (
                  <ArrowRight
                    size={14}
                    strokeWidth={1.5}
                    style={{ opacity: index === selectedIndex ? 0.8 : 0 }}
                    aria-hidden="true"
                  />
                )}
              </div>
            ))
          )}
        </div>
        <div className="paletteFooter">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
