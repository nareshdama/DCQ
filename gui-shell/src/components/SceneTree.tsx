import { useCallback } from "react";
import { Eye, EyeOff, Focus, Box } from "lucide-react";
import type { SceneObject } from "../types";

type Props = {
  scene: SceneObject[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onToggleVisibility: (index: number) => void;
  onChangeColor: (index: number, color: string) => void;
};

function formatTriangles(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}

function formatBBox(bbox: { min: number[]; max: number[] }): string {
  const dx = (bbox.max[0] - bbox.min[0]).toFixed(1);
  const dy = (bbox.max[1] - bbox.min[1]).toFixed(1);
  const dz = (bbox.max[2] - bbox.min[2]).toFixed(1);
  return `${dx} \u00d7 ${dy} \u00d7 ${dz}`;
}

export default function SceneTree({
  scene,
  selectedIndex,
  onSelect,
  onToggleVisibility,
  onChangeColor,
}: Props) {
  const handleColorInput = useCallback(
    (index: number, event: React.ChangeEvent<HTMLInputElement>) => {
      onChangeColor(index, event.target.value);
    },
    [onChangeColor]
  );

  if (scene.length === 0) {
    return (
      <div className="sceneTree">
        <div className="sceneTreeEmpty">
          <Box size={24} strokeWidth={1} className="sceneTreeEmptyIcon" />
          <p>No objects in scene</p>
          <p className="muted">Run a script with show_object() to see objects here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sceneTree">
      <div className="sceneTreeHeader">
        <span className="sceneTreeTitle">Scene</span>
        <span className="sceneTreeCount">{scene.length} object{scene.length !== 1 ? "s" : ""}</span>
      </div>
      <ul className="sceneTreeList" role="listbox" aria-label="Scene objects">
        {scene.map((obj, index) => {
          const isSelected = selectedIndex === index;
          return (
            <li
              key={`${obj.name}-${index}`}
              role="option"
              aria-selected={isSelected}
              className={`sceneTreeItem ${isSelected ? "sceneTreeItem--selected" : ""} ${
                !obj.visible ? "sceneTreeItem--hidden" : ""
              }`}
            >
              <button
                type="button"
                className="sceneTreeVisibility"
                onClick={() => onToggleVisibility(index)}
                title={obj.visible ? "Hide object" : "Show object"}
                aria-label={obj.visible ? `Hide ${obj.name}` : `Show ${obj.name}`}
              >
                {obj.visible ? (
                  <Eye size={14} strokeWidth={1.5} />
                ) : (
                  <EyeOff size={14} strokeWidth={1.5} />
                )}
              </button>

              <label
                className="sceneTreeColorSwatch"
                title="Change color"
                style={{ backgroundColor: obj.color }}
              >
                <input
                  type="color"
                  value={obj.color}
                  onChange={(e) => handleColorInput(index, e)}
                  className="sceneTreeColorInput"
                  aria-label={`Color for ${obj.name}`}
                />
              </label>

              <button
                type="button"
                className="sceneTreeName"
                onClick={() => onSelect(index)}
                title={`Focus on ${obj.name}`}
              >
                <span className="sceneTreeNameText">{obj.name}</span>
                <span className="sceneTreeMeta">
                  {obj.triangles > 0 ? (
                    <span className="sceneTreeBadge" title={`${obj.triangles} triangles`}>
                      {formatTriangles(obj.triangles)}
                    </span>
                  ) : null}
                </span>
              </button>

              <button
                type="button"
                className="sceneTreeFocus"
                onClick={() => onSelect(index)}
                title={`Fit camera to ${obj.name}`}
                aria-label={`Focus camera on ${obj.name}`}
              >
                <Focus size={13} strokeWidth={1.5} />
              </button>
            </li>
          );
        })}
      </ul>

      {selectedIndex != null && scene[selectedIndex] ? (
        <div className="sceneTreeDetail">
          <div className="sceneTreeDetailRow">
            <span className="sceneTreeDetailLabel">Name</span>
            <span className="sceneTreeDetailValue">{scene[selectedIndex].name}</span>
          </div>
          <div className="sceneTreeDetailRow">
            <span className="sceneTreeDetailLabel">Size</span>
            <span className="sceneTreeDetailValue">{formatBBox(scene[selectedIndex].bbox)}</span>
          </div>
          <div className="sceneTreeDetailRow">
            <span className="sceneTreeDetailLabel">Triangles</span>
            <span className="sceneTreeDetailValue">{scene[selectedIndex].triangles.toLocaleString()}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
