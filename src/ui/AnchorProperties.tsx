import { useEffect, useState } from "react";
import { Crosshair } from "lucide-react";
import type { Hit } from "../renderer/WebGLRenderer";
import { useStore } from "../project/store";
import { updateAnchorPoint } from "../compiler/refactor";
export function AnchorProperties({ hit }: { hit: Hit }) {
  const [x, y] = hit.node.transform.anchorPoint;
  const [draft, setDraft] = useState([String(x), String(y)]);
  useEffect(() => setDraft([String(x), String(y)]), [x, y, hit.node.id]);
  const setAnchor = (point: [number, number]) => {
    setDraft(point.map(String));
    useStore.getState().edit((p) => ({
      ...p,
      code: updateAnchorPoint(
        p.code,
        p.assets,
        hit.node.id,
        point,
        p.settings.duration,
      ),
    }));
  };
  return (
    <div className="anchor-properties">
      <h3>Anchor point</h3>
      <div className="anchor-controls">
        <div className="anchor-presets" aria-label="Anchor presets">
          {[1, 0, -1].flatMap((row, ri) =>
            [-1, 0, 1].map((column, ci) => {
              const ax = (column * hit.localWidth) / 2,
                ay = (row * hit.localHeight) / 2;
              const label = [
                "Top left",
                "Top",
                "Top right",
                "Left",
                "Center",
                "Right",
                "Bottom left",
                "Bottom",
                "Bottom right",
              ][ri * 3 + ci];
              return (
                <button
                  key={label}
                  aria-label={`Anchor ${label.toLowerCase()}`}
                  title={label}
                  aria-pressed={
                    Math.abs(x - ax) < 0.01 && Math.abs(y - ay) < 0.01
                  }
                  onClick={() => setAnchor([ax, ay])}
                >
                  {row === 0 && column === 0 ? (
                    <Crosshair size={13} />
                  ) : (
                    <span />
                  )}
                </button>
              );
            }),
          )}
        </div>
        <div className="anchor-values">
          <label>
            X
            <input
              aria-label="Anchor X"
              type="number"
              step="1"
              value={draft[0]}
              onChange={(e) => {
                setDraft([e.target.value, draft[1]]);
                if (e.target.value !== "")
                  setAnchor([Number(e.target.value), Number(draft[1])]);
              }}
            />
          </label>
          <label>
            Y
            <input
              aria-label="Anchor Y"
              type="number"
              step="1"
              value={draft[1]}
              onChange={(e) => {
                setDraft([draft[0], e.target.value]);
                if (e.target.value !== "")
                  setAnchor([Number(draft[0]), Number(e.target.value)]);
              }}
            />
          </label>
          <small>px · center (0, 0) · +Y up</small>
        </div>
      </div>
    </div>
  );
}
