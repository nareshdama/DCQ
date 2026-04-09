import { useMemo } from "react";
import { Check, Undo2, Eye, EyeOff } from "lucide-react";
import { useState } from "react";

type Props = {
  currentCode: string;
  proposedCode: string;
  onApply: (code: string) => void;
  onUndo: () => void;
  canUndo: boolean;
};

type DiffLine = {
  type: "context" | "added" | "removed";
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
};

function computeSimpleDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const result: DiffLine[] = [];

  const maxLen = Math.max(oldLines.length, newLines.length);
  let oldIdx = 0;
  let newIdx = 0;

  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    if (oldIdx < oldLines.length && newIdx < newLines.length) {
      if (oldLines[oldIdx] === newLines[newIdx]) {
        result.push({
          type: "context",
          content: oldLines[oldIdx],
          oldLineNum: oldIdx + 1,
          newLineNum: newIdx + 1,
        });
        oldIdx++;
        newIdx++;
      } else {
        let foundAhead = false;
        for (let look = 1; look <= 3 && newIdx + look < newLines.length; look++) {
          if (oldLines[oldIdx] === newLines[newIdx + look]) {
            for (let j = 0; j < look; j++) {
              result.push({
                type: "added",
                content: newLines[newIdx + j],
                newLineNum: newIdx + j + 1,
              });
            }
            newIdx += look;
            foundAhead = true;
            break;
          }
        }
        if (!foundAhead) {
          let foundOldAhead = false;
          for (let look = 1; look <= 3 && oldIdx + look < oldLines.length; look++) {
            if (oldLines[oldIdx + look] === newLines[newIdx]) {
              for (let j = 0; j < look; j++) {
                result.push({
                  type: "removed",
                  content: oldLines[oldIdx + j],
                  oldLineNum: oldIdx + j + 1,
                });
              }
              oldIdx += look;
              foundOldAhead = true;
              break;
            }
          }
          if (!foundOldAhead) {
            result.push({
              type: "removed",
              content: oldLines[oldIdx],
              oldLineNum: oldIdx + 1,
            });
            result.push({
              type: "added",
              content: newLines[newIdx],
              newLineNum: newIdx + 1,
            });
            oldIdx++;
            newIdx++;
          }
        }
      }
    } else if (oldIdx < oldLines.length) {
      result.push({
        type: "removed",
        content: oldLines[oldIdx],
        oldLineNum: oldIdx + 1,
      });
      oldIdx++;
    } else {
      result.push({
        type: "added",
        content: newLines[newIdx],
        newLineNum: newIdx + 1,
      });
      newIdx++;
    }

    if (result.length > maxLen + 200) break;
  }

  return result;
}

export default function AIDiffPreview({
  currentCode,
  proposedCode,
  onApply,
  onUndo,
  canUndo,
}: Props) {
  const [showDiff, setShowDiff] = useState(true);
  const diff = useMemo(
    () => computeSimpleDiff(currentCode, proposedCode),
    [currentCode, proposedCode],
  );

  const addedCount = diff.filter((d) => d.type === "added").length;
  const removedCount = diff.filter((d) => d.type === "removed").length;

  return (
    <div className="aiDiffPreview">
      <div className="aiDiffHeader">
        <div className="aiDiffStats">
          {addedCount > 0 && (
            <span className="aiDiffStat aiDiffStat--added">+{addedCount}</span>
          )}
          {removedCount > 0 && (
            <span className="aiDiffStat aiDiffStat--removed">-{removedCount}</span>
          )}
        </div>
        <div className="aiDiffActions">
          <button
            className="aiDiffBtn"
            onClick={() => setShowDiff((v) => !v)}
            title={showDiff ? "Hide diff" : "Show diff"}
          >
            {showDiff ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          {canUndo && (
            <button className="aiDiffBtn" onClick={onUndo} title="Undo last apply">
              <Undo2 size={14} />
              <span>Undo</span>
            </button>
          )}
          <button
            className="aiDiffBtn aiDiffBtn--apply"
            onClick={() => onApply(proposedCode)}
            title="Apply to editor"
          >
            <Check size={14} />
            <span>Apply</span>
          </button>
        </div>
      </div>
      {showDiff && (
        <div className="aiDiffBody">
          {diff.map((line, i) => (
            <div key={i} className={`aiDiffLine aiDiffLine--${line.type}`}>
              <span className="aiDiffLineNum">
                {line.type === "removed"
                  ? line.oldLineNum ?? ""
                  : line.type === "added"
                    ? line.newLineNum ?? ""
                    : line.oldLineNum ?? ""}
              </span>
              <span className="aiDiffLineSign">
                {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
              </span>
              <span className="aiDiffLineContent">{line.content}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
