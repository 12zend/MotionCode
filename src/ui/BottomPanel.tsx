import { useState } from "react";
import {
  AlertCircle,
  Braces,
  Layers,
  SlidersHorizontal,
  Terminal,
  Search,
  X,
} from "lucide-react";
import { useStore } from "../project/store";
import { preprocessShader } from "../shaders/preprocess";
import type { SceneNode } from "../runtime/types";
import type { Compilation } from "../compiler";
import { AnchorProperties } from "./AnchorProperties";
import type { Hit, RenderStats } from "../renderer/WebGLRenderer";
export function BottomPanel({
  nodes,
  compilation,
  stats,
  onShader,
  activeTab,
  onTab,
  onClose,
  objectBounds,
}: {
  objectBounds: Hit[];
  activeTab: string;
  onTab: (tab: string) => void;
  onClose: () => void;
  nodes: SceneNode[];
  compilation: Compilation | null;
  stats: RenderStats;
  onShader: (id: string) => void;
}) {
  const tab = activeTab,
    setTab = onTab;
  const [query, setQuery] = useState(""),
    [replacement, setReplacement] = useState("");
  const project = useStore((s) => s.project),
    time = useStore((s) => s.time),
    diagnostics = useStore((s) => s.diagnostics),
    selectedAsset = useStore((s) => s.selectedAsset),
    selectedLine = useStore((s) => s.selectedLine);
  const selectedHit = objectBounds.find(
    (hit) => hit.node.line === selectedLine,
  );
  const shader = project.assets.find(
    (a) => a.id === selectedAsset && a.type === "shader",
  );
  const flatten = (
    ns: SceneNode[],
    depth = 0,
  ): { node: SceneNode; depth: number }[] =>
    ns.flatMap((node) => [
      { node, depth },
      ...flatten(node.children ?? [], depth + 1),
    ]);
  const tracks = flatten(nodes);
  const uniforms = shader ? preprocessShader(shader.data).uniforms : [];
  const setUniform = (name: string, value: number | number[] | boolean) =>
    useStore.getState().edit((p) => ({
      ...p,
      uniformValues: {
        ...p.uniformValues,
        [shader!.id]: { ...p.uniformValues[shader!.id], [name]: value },
      },
    }));
  const tabs = [
    { id: "timeline", label: "Timeline", icon: Layers },
    { id: "properties", label: "Properties", icon: SlidersHorizontal },
    { id: "console", label: "Console", icon: Terminal },
    { id: "search", label: "Search", icon: Search },
    { id: "compiler", label: "Compiler", icon: Braces },
  ];
  return (
    <section className="bottom-panel">
      <div className="bottom-tabs">
        {tabs
          .filter(
            (t) =>
              ["timeline", "properties", "console"].includes(t.id) ||
              t.id === tab,
          )
          .map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "active" : ""}
              onClick={() => setTab(t.id)}
            >
              <t.icon size={14} />
              {t.label}
              {t.id === "console" && diagnostics.length > 0 && (
                <span className="error-count">{diagnostics.length}</span>
              )}
            </button>
          ))}
        <button
          className="bottom-close icon-button"
          aria-label="Close bottom panel"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>
      {tab === "timeline" && (
        <div className="timeline">
          <div className="timeline-ruler">
            <span className="track-label">
              SCENE OBJECTS <small>{tracks.length}</small>
            </span>
            <div
              className="ruler"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                useStore.getState().set({
                  time: Math.max(
                    0,
                    Math.min(
                      project.settings.duration,
                      ((e.clientX - r.left) / r.width) *
                        project.settings.duration,
                    ),
                  ),
                });
              }}
            >
              {Array.from({ length: 11 }, (_, i) => (
                <span key={i} style={{ left: `${i * 10}%` }}>
                  {((project.settings.duration * i) / 10).toFixed(1)}s
                </span>
              ))}
            </div>
          </div>
          <div className="tracks">
            {tracks.map(({ node, depth }) => (
              <div className="track" key={node.id}>
                <button
                  className="track-label"
                  style={{ paddingLeft: 16 + depth * 16 }}
                  onClick={() =>
                    useStore.getState().set({ selectedLine: node.line })
                  }
                >
                  {node.kind === "group" ? (
                    <Layers size={12} />
                  ) : (
                    <span className="track-dot" />
                  )}
                  <span>
                    {node.kind === "text"
                      ? node.text
                      : node.kind === "draw"
                        ? project.assets.find((a) => a.id === node.assetId)
                            ?.name
                        : node.kind}
                  </span>
                  <small>L{node.line}</small>
                </button>
                <div
                  className="track-lane"
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    useStore.getState().set({
                      time: Math.max(
                        0,
                        Math.min(
                          project.settings.duration,
                          ((e.clientX - r.left) / r.width) *
                            project.settings.duration,
                        ),
                      ),
                    });
                  }}
                >
                  <div
                    className={`track-bar ${node.kind === "group" ? "group-bar" : ""}`}
                    style={{
                      left: `${(node.t1 / project.settings.duration) * 100}%`,
                      width: `${(Math.max(0, Math.min(node.t2, project.settings.duration) - node.t1) / project.settings.duration) * 100}%`,
                    }}
                  >
                    <span>
                      {node.kind === "group" ? "Group composite" : node.kind}
                    </span>
                    {node.shaders.length > 0 && <Braces size={11} />}
                  </div>
                </div>
              </div>
            ))}
            {!tracks.length && (
              <div className="empty">
                Compile a scene to inspect its objects.
              </div>
            )}
            <div
              className="playhead"
              style={{
                left: `calc(220px + (100% - 220px) * ${time / project.settings.duration})`,
              }}
            />
          </div>
          <div className="timeline-footer">
            Code defines timing. Click the ruler to seek.
            <span>
              {project.settings.fps} fps ·{" "}
              {project.settings.duration.toFixed(2)} seconds
            </span>
          </div>
        </div>
      )}
      {tab === "properties" && (
        <div className="properties-panel">
          {selectedHit && <AnchorProperties hit={selectedHit} />}
          <div className="settings-fields">
            <h3>Project settings</h3>
            {(["width", "height", "fps", "duration", "seed"] as const).map(
              (key) => (
                <label key={key}>
                  {key}
                  <input
                    type="number"
                    aria-label={`Project ${key}`}
                    value={project.settings[key]}
                    min={key === "seed" ? 0 : 1}
                    max={
                      key === "fps"
                        ? 240
                        : key === "duration"
                          ? 3600
                          : key === "seed"
                            ? 2147483647
                            : 8192
                    }
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (
                        value >= (key === "seed" ? 0 : 1) &&
                        value <= Number(e.target.max)
                      )
                        useStore.getState().edit((p) => ({
                          ...p,
                          settings: { ...p.settings, [key]: value },
                        }));
                    }}
                  />
                </label>
              ),
            )}
            <label>
              background
              <input
                type="color"
                aria-label="Project background"
                value={project.settings.background}
                onChange={(e) =>
                  useStore.getState().edit((p) => ({
                    ...p,
                    settings: { ...p.settings, background: e.target.value },
                  }))
                }
              />
            </label>
          </div>
          <div className="uniform-fields">
            <h3>{shader ? shader.name : "Shader uniforms"}</h3>
            {!shader && (
              <p>
                Select a shader in the Media Library. Its uniforms appear here
                automatically.
              </p>
            )}
            {shader && uniforms.length === 0 && (
              <p>This shader has no custom uniforms.</p>
            )}
            {uniforms.map((u) => {
              const value =
                project.uniformValues[shader!.id]?.[u.name] ?? u.defaultValue;
              return (
                <label key={u.name} className="uniform-control">
                  <span>
                    {u.name}
                    <small>{u.type}</small>
                  </span>
                  {u.type === "bool" ? (
                    <input
                      type="checkbox"
                      aria-label={u.name}
                      checked={Boolean(value)}
                      onChange={(e) => setUniform(u.name, e.target.checked)}
                    />
                  ) : Array.isArray(value) ? (
                    <div className="vector-input">
                      {u.type === "vec3" && /color/i.test(u.name) && (
                        <input
                          type="color"
                          aria-label={`${u.name} color`}
                          value={
                            "#" +
                            value
                              .map((v) =>
                                Math.round(Math.max(0, Math.min(1, v)) * 255)
                                  .toString(16)
                                  .padStart(2, "0"),
                              )
                              .join("")
                          }
                          onChange={(e) =>
                            setUniform(
                              u.name,
                              [1, 3, 5].map(
                                (i) =>
                                  parseInt(e.target.value.slice(i, i + 2), 16) /
                                  255,
                              ),
                            )
                          }
                        />
                      )}
                      {value.map((v, i) => (
                        <input
                          key={i}
                          type="number"
                          aria-label={`${u.name} ${i}`}
                          step="0.01"
                          value={v}
                          onChange={(e) =>
                            setUniform(
                              u.name,
                              value.map((n, j) =>
                                j === i ? Number(e.target.value) : n,
                              ),
                            )
                          }
                        />
                      ))}
                    </div>
                  ) : (
                    <>
                      <input
                        type="range"
                        aria-label={u.name}
                        min={u.min}
                        max={u.max}
                        step={u.type === "int" ? 1 : 0.01}
                        value={Number(value)}
                        onChange={(e) =>
                          setUniform(u.name, Number(e.target.value))
                        }
                      />
                      <output>{Number(value).toFixed(2)}</output>
                    </>
                  )}
                </label>
              );
            })}
            {shader && (
              <button
                className="subtle-button"
                onClick={() => onShader(shader.id)}
              >
                Edit shader source
              </button>
            )}
          </div>
        </div>
      )}
      {tab === "console" && (
        <div className="console-panel">
          {diagnostics.length ? (
            diagnostics.map((d, i) => (
              <button
                key={i}
                className="diagnostic"
                onClick={() => {
                  if (d.source) {
                    const a = project.assets.find((a) => a.name === d.source);
                    if (a) onShader(a.id);
                  }
                  useStore.getState().set({ selectedLine: d.line });
                }}
              >
                <AlertCircle size={15} />
                <span>
                  <strong>
                    {d.source ?? "main.motion"}:{d.line}:{d.column}
                  </strong>{" "}
                  {d.message}
                  {d.suggestion && <small>{d.suggestion}</small>}
                </span>
              </button>
            ))
          ) : (
            <div className="console-success">
              <span className="status-dot" /> Compilation successful.{" "}
              {compilation?.ir?.sites.length ?? 0} call sites ·{" "}
              {compilation?.compileMs.toFixed(2)} ms
            </div>
          )}
          <div className="console-performance">
            Textures {stats.textures} · Draw calls {stats.drawCalls} · GPU
            passes {stats.gpuPasses} · Render {stats.renderMs.toFixed(2)} ms
          </div>
        </div>
      )}
      {tab === "search" && (
        <div className="global-search">
          <div className="search-controls">
            <input
              aria-label="Search project"
              placeholder="Search code, shaders and assets"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <input
              aria-label="Replace with"
              placeholder="Replace with…"
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
            />
            <button
              disabled={!query}
              onClick={() =>
                useStore.getState().edit((p) => ({
                  ...p,
                  code: p.code.split(query).join(replacement),
                  assets: p.assets.map((a) =>
                    a.type === "shader"
                      ? { ...a, data: a.data.split(query).join(replacement) }
                      : a,
                  ),
                }))
              }
            >
              Replace all in source
            </button>
          </div>
          {query &&
            [
              { name: "main.motion", data: project.code, id: "" },
              ...project.assets.filter((a) => a.type === "shader"),
            ].flatMap((a) =>
              a.data.split("\n").flatMap((line, i) =>
                line.toLowerCase().includes(query.toLowerCase())
                  ? [
                      <button
                        className="search-result"
                        key={`${a.id}:${i}`}
                        onClick={() => {
                          onShader(a.id);
                          useStore.getState().set({ selectedLine: i + 1 });
                        }}
                      >
                        <span>
                          {a.name}:{i + 1}
                        </span>
                        <code>{line}</code>
                      </button>,
                    ]
                  : [],
              ),
            )}
          {query &&
            project.assets
              .filter((a) => a.name.toLowerCase().includes(query.toLowerCase()))
              .map((a) => (
                <button
                  className="search-result"
                  key={a.id}
                  onClick={() =>
                    useStore.getState().set({ selectedAsset: a.id })
                  }
                >
                  {a.type}: {a.name}
                </button>
              ))}
        </div>
      )}
      {tab === "compiler" && (
        <div className="compiler-panel">
          <div>
            <h3>Motion IR</h3>
            <pre>
              {JSON.stringify(
                {
                  version: compilation?.ir?.version,
                  dependencies: compilation?.ir?.dependencies,
                  sites: compilation?.ir?.sites,
                },
                null,
                2,
              )}
            </pre>
          </div>
          <div>
            <h3>Generated JavaScript</h3>
            <pre>
              {compilation?.code || "Compile to inspect generated code."}
            </pre>
          </div>
        </div>
      )}
    </section>
  );
}
