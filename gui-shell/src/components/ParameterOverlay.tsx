import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  formatParameterValue,
  getParameterRange,
  getScriptParameterKey,
  type ScriptParameter,
} from "../editorIntelligence";

type Props = {
  parameters: ScriptParameter[];
  onChange: (parameter: ScriptParameter, nextValue: number) => void;
};

export default function ParameterOverlay({ parameters, onChange }: Props) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const orderedParameters = useMemo(
    () => [...parameters].sort((left, right) => left.lineNumber - right.lineNumber),
    [parameters]
  );

  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        orderedParameters.map((parameter) => [
          getScriptParameterKey(parameter),
          formatParameterValue(parameter, parameter.value),
        ])
      )
    );
  }, [orderedParameters]);

  if (orderedParameters.length === 0) {
    return null;
  }

  return (
    <section className="parameterOverlay" aria-label="Detected script parameters">
      <div className="parameterOverlayHeader">
        <div className="parameterOverlayTitle">
          <SlidersHorizontal size={14} strokeWidth={1.75} />
          <span>Parameters</span>
        </div>
        <span className="parameterOverlayCount">{orderedParameters.length}</span>
      </div>
      <div className="parameterOverlayList">
        {orderedParameters.map((parameter) => {
          const key = getScriptParameterKey(parameter);
          const range = getParameterRange(parameter);
          const displayValue = drafts[key] ?? formatParameterValue(parameter, parameter.value);
          const isResetDisabled = parameter.value === parameter.initialValue;

          return (
            <div key={key} className="parameterCard">
              <div className="parameterCardHeader">
                <label className="parameterName" htmlFor={`parameter-input-${key}`}>
                  {parameter.name}
                </label>
                <input
                  id={`parameter-input-${key}`}
                  className="parameterInput"
                  type="number"
                  step={range.step}
                  value={displayValue}
                  onChange={(event) => {
                    const nextDraft = event.target.value;
                    setDrafts((current) => ({ ...current, [key]: nextDraft }));
                    const nextValue = Number(nextDraft);
                    if (nextDraft.trim() && Number.isFinite(nextValue)) {
                      onChange(parameter, nextValue);
                    }
                  }}
                  onBlur={() => {
                    setDrafts((current) => ({
                      ...current,
                      [key]: formatParameterValue(parameter, parameter.value),
                    }));
                  }}
                />
              </div>
              <div className="parameterSliderRow">
                <input
                  className="parameterSlider"
                  type="range"
                  min={range.min}
                  max={range.max}
                  step={range.step}
                  value={parameter.value}
                  onChange={(event) => {
                    const nextValue = Number(event.target.value);
                    onChange(parameter, nextValue);
                  }}
                />
                <button
                  type="button"
                  className="parameterReset"
                  disabled={isResetDisabled}
                  onClick={() => onChange(parameter, parameter.initialValue)}
                  title="Reset to original value"
                  aria-label={`Reset ${parameter.name} to original value`}
                >
                  <RotateCcw size={13} strokeWidth={1.75} />
                </button>
              </div>
              <div className="parameterMeta">
                <span>{`Line ${parameter.lineNumber}`}</span>
                <span>{`Range ${range.min}–${range.max}`}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
