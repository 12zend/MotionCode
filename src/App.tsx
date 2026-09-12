import { useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Square,
  Repeat,
  Maximize2,
  Download,
  FolderOpen,
  Save,
  PanelLeftClose,
  PanelBottomClose,
  Code2,
  Check,
  ChevronDown,
  X,
  Monitor,
  Camera,
  Video,
  PanelsTopLeft,
} from "lucide-react";
import type * as Monaco from "monaco-editor";
import { useStore } from "./project/store";
import {
  deserializeProject,
  loadLocal,
  saveLocal,
} from "./project/persistence";
import { CodeEditor } from "./editor/CodeEditor";
import { MediaLibrary } from "./ui/MediaLibrary";
import { BottomPanel } from "./ui/BottomPanel";
import { useEngine } from "./ui/useEngine";
import { assetCode } from "./assets/assets";
import type { Asset } from "./project/types";
import {
  ProjectFileWriter,
  browserSavePicker,
  rememberFileHandle,
  restoreFileHandle,
} from "./project/fileAccess";
import { screenToProject } from "./runtime/coordinates";
import { exportFrame, startWebM } from "./export/export";
export default function App() {
  const project = useStore((s) => s.project),
    time = useStore((s) => s.time),
    playing = useStore((s) => s.playing),
    loop = useStore((s) => s.loop),
    quality = useStore((s) => s.quality),
    diagnostics = useStore((s) => s.diagnostics),
    selectedLine = useStore((s) => s.selectedLine);
  const canvas = useRef<HTMLCanvasElement>(null),
    preview = useRef<HTMLDivElement>(null),
    editor = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null),
    file = useRef<HTMLInputElement>(null);
  const [shaderId, setShaderId] = useState<string | null>(null),
    [mediaOpen, setMediaOpen] = useState(true),
    [bottomOpen, setBottomOpen] = useState(false),
    [editorOpen, setEditorOpen] = useState(true),
    [saved, setSaved] = useState("Local autosave"),
    [message, setMessage] = useState(""),
    [exportOpen, setExportOpen] = useState(false),
    [viewOpen, setViewOpen] = useState(false),
    [bottomTab, setBottomTab] = useState("timeline"),
    [recording, setRecording] = useState(false),
    [ready, setReady] = useState(false),
    [mediaWidth, setMediaWidth] = useState(210),
    [codeWidth, setCodeWidth] = useState(46),
    [bottomHeight, setBottomHeight] = useState(245);
  const stopRecord = useRef<(() => void) | null>(null);
  const fileWriter = useRef<ProjectFileWriter | null>(null);
  if (!fileWriter.current)
    fileWriter.current = new ProjectFileWriter(
      browserSavePicker(),
      rememberFileHandle,
    );
  const [fileTarget, setFileTarget] = useState<string | null>(null);
  const [fileSaving, setFileSaving] = useState(false);
  const engine = useEngine(canvas);
  const shader = project.assets.find((a) => a.id === shaderId);
  useEffect(() => {
    let alive = true;
    void loadLocal()
      .then(async (p) => {
        if (alive && p) {
          useStore.getState().setProject(p, false);
          const handle = await restoreFileHandle(p.id).catch(() => null);
          if (alive && useStore.getState().project.id === p.id) {
            fileWriter.current?.setTarget(p.id, handle);
            setFileTarget(handle?.name ?? null);
          }
        }
      })
      .catch((e) => setMessage(`Autosave could not be restored: ${e}`))
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    setSaved("Saving…");
    const timer = setTimeout(() => {
      void saveLocal(project)
        .then(() => setSaved("Saved locally"))
        .catch((e) => {
          setSaved("Save failed");
          setMessage(String(e));
        });
    }, 700);
    return () => clearTimeout(timer);
  }, [project, ready]);
  const save = async (saveAs = false) => {
    setFileSaving(true);
    try {
      const result = await fileWriter.current!.save(
        useStore.getState().project,
        saveAs,
      );
      if (result.mode === "file") {
        setFileTarget(result.name);
        setMessage(`保存しました: ${result.name}`);
      } else {
        setMessage(
          ".motionをダウンロードしました。このブラウザは同じファイルへの上書き保存に対応していません。",
        );
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        setMessage(
          `保存できませんでした: ${error instanceof Error ? error.message : String(error)}`,
        );
    } finally {
      setFileSaving(false);
    }
  };
  const open = async (f: File | undefined) => {
    if (!f) return;
    try {
      const p = deserializeProject(await f.text());
      useStore.getState().setProject(p);
      fileWriter.current?.setTarget(p.id, null);
      void rememberFileHandle(p.id, null).catch(() => {});
      setFileTarget(null);
      useStore.getState().set({
        time: 0,
        playing: false,
        selectedAsset: null,
        selectedLine: 1,
      });
      setShaderId(null);
      setMessage(`Opened ${f.name}`);
    } catch (e) {
      setMessage(String(e));
    }
  };
  const insert = (a: Asset) => {
    setShaderId(null);
    setTimeout(() => {
      const e = editor.current;
      if (!e) return;
      const model = e.getModel();
      if (!model) return;
      const line = model.getLineCount();
      e.executeEdits("insert-asset", [
        {
          range: {
            startLineNumber: line,
            startColumn: model.getLineMaxColumn(line),
            endLineNumber: line,
            endColumn: model.getLineMaxColumn(line),
          },
          text: "\n" + assetCode(a) + "\n",
        },
      ]);
      e.focus();
    }, 0);
  };
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      const command = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement;
      const editing = target.closest(
        '.monaco-editor,input,textarea,select,[contenteditable="true"]',
      );
      if (command && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save(e.shiftKey);
      } else if (command && e.key === "Enter") {
        e.preventDefault();
        engine.recompile();
      } else if (
        command &&
        e.key.toLowerCase() === "z" &&
        !target.closest(".monaco-editor")
      ) {
        e.preventDefault();
        e.shiftKey ? useStore.getState().redo() : useStore.getState().undo();
      } else if (!editing && e.code === "Space") {
        e.preventDefault();
        void engine.toggle();
      } else if (!editing && e.key.toLowerCase() === "f") {
        e.preventDefault();
        void preview.current?.requestFullscreen();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  });
  useEffect(() => {
    if (recording && !playing) {
      stopRecord.current?.();
      stopRecord.current = null;
      setRecording(false);
    }
  }, [playing, recording]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 7000);
    return () => clearTimeout(timer);
  }, [message]);
  const resize = (e: React.PointerEvent, kind: "media" | "code" | "bottom") => {
    e.preventDefault();
    const x = e.clientX,
      y = e.clientY,
      start =
        kind === "media"
          ? mediaWidth
          : kind === "code"
            ? codeWidth
            : bottomHeight;
    const move = (ev: PointerEvent) => {
      if (kind === "media")
        setMediaWidth(Math.max(180, Math.min(380, start + ev.clientX - x)));
      else if (kind === "code")
        setCodeWidth(
          Math.max(
            28,
            Math.min(
              68,
              start +
                ((ev.clientX - x) / (window.innerWidth - mediaWidth)) * 100,
            ),
          ),
        );
      else
        setBottomHeight(
          Math.max(
            150,
            Math.min(window.innerHeight * 0.55, start + y - ev.clientY),
          ),
        );
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const hits =
    engine.renderer.current?.hits.filter((h) => h.node.line === selectedLine) ??
    [];
  return (
    <main
      className="ide"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        const f = e.dataTransfer.files[0];
        if (f?.name.endsWith(".motion")) {
          e.preventDefault();
          void open(f);
        }
      }}
    >
      <header className="toolbar">
        <div className="brand">
          <span className="brand-mark">
            <Code2 size={21} />
          </span>
          <span>MotionCode</span>
        </div>
        <div className="toolbar-divider" />
        <input
          className="project-name"
          aria-label="Project name"
          value={project.name}
          onChange={(e) =>
            useStore.getState().edit((p) => ({ ...p, name: e.target.value }))
          }
        />
        <div className="toolbar-spacer" />
        <span className="save-state" title={saved}>
          <Check size={12} />
        </span>
        <div className="view-control">
          <button
            className="icon-button"
            title="Panels"
            aria-label="Panels"
            onClick={() => setViewOpen(!viewOpen)}
          >
            <PanelsTopLeft size={16} />
          </button>
          {viewOpen && (
            <div className="view-menu">
              <span className="menu-label">Workspace</span>
              <button onClick={() => setMediaOpen(!mediaOpen)}>
                {mediaOpen ? "Hide" : "Show"} Media
              </button>
              <button onClick={() => setEditorOpen(!editorOpen)}>
                {editorOpen ? "Hide" : "Show"} Editor
              </button>
              {["timeline", "properties", "console", "search", "compiler"].map(
                (tab) => (
                  <button
                    key={tab}
                    onClick={() => {
                      setBottomTab(tab);
                      setBottomOpen(true);
                      setViewOpen(false);
                    }}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ),
              )}
              {bottomOpen && (
                <button
                  onClick={() => {
                    setBottomOpen(false);
                    setViewOpen(false);
                  }}
                >
                  Close bottom panel
                </button>
              )}
            </div>
          )}
        </div>
        <div className="toolbar-divider" />
        <button
          className="toolbar-button"
          onClick={() => file.current?.click()}
        >
          <FolderOpen size={15} />
          <span>Open</span>
        </button>
        <button
          className="toolbar-button"
          onClick={() => void save()}
          title={
            fileTarget
              ? `上書き保存: ${fileTarget}`
              : "保存先を選択 (Ctrl/Cmd+S)"
          }
          aria-busy={fileSaving}
        >
          <Save size={15} />
          <span>{fileSaving ? "Saving…" : "Save"}</span>
        </button>
        <div className="export-control">
          <button
            className="export-button"
            onClick={() => setExportOpen(!exportOpen)}
          >
            <Download size={14} />
            Export
            <ChevronDown size={13} />
          </button>
          {exportOpen && (
            <div className="export-menu">
              <button
                onClick={() => {
                  setExportOpen(false);
                  void save(true);
                }}
              >
                <Save size={14} /> Save project as…
              </button>
              <button
                onClick={() => {
                  if (canvas.current)
                    void exportFrame(canvas.current, project.name).catch((e) =>
                      setMessage(String(e)),
                    );
                  setExportOpen(false);
                }}
              >
                <Camera size={14} /> PNG frame
              </button>
              <button
                onClick={() => {
                  if (canvas.current)
                    void exportFrame(
                      canvas.current,
                      project.name,
                      "image/webp",
                    ).catch((e) => setMessage(String(e)));
                  setExportOpen(false);
                }}
              >
                <Camera size={14} /> WebP frame
              </button>
              <button
                onClick={() => {
                  try {
                    if (recording) {
                      stopRecord.current?.();
                      setRecording(false);
                    } else if (canvas.current) {
                      useStore
                        .getState()
                        .set({ time: 0, loop: false, playing: true });
                      stopRecord.current = startWebM(
                        canvas.current,
                        project.settings.fps,
                        project.name,
                      );
                      setRecording(true);
                    }
                    setExportOpen(false);
                  } catch (e) {
                    setMessage(String(e));
                  }
                }}
              >
                <Video size={14} />
                {recording ? "Finish WebM" : "Record WebM (silent)"}
              </button>
              <small>Uses preview resolution & renderer</small>
            </div>
          )}
        </div>
        <input
          type="file"
          hidden
          ref={file}
          data-testid="project-input"
          accept=".motion"
          onChange={(e) => {
            void open(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </header>
      <div
        className="workspace"
        style={{
          height: bottomOpen
            ? `calc(100% - ${bottomHeight + 87}px)`
            : "calc(100% - 87px)",
        }}
      >
        {mediaOpen && (
          <>
            <div className="media-container" style={{ width: mediaWidth }}>
              <MediaLibrary
                onShader={(id) => {
                  setShaderId(id);
                  useStore.getState().set({ selectedAsset: id });
                }}
                onInsert={insert}
                onMain={() => setShaderId(null)}
              />
            </div>
            <div
              className="resize-handle vertical"
              role="separator"
              aria-label="Resize media panel"
              onPointerDown={(e) => resize(e, "media")}
            />
          </>
        )}
        <div className="work-area">
          {editorOpen && (
            <>
              <section
                className="code-panel"
                style={{ width: `${codeWidth}%` }}
              >
                <div className="editor-tabs">
                  <button
                    className={!shader ? "active" : ""}
                    onClick={() => setShaderId(null)}
                  >
                    <FileTab />
                    main.motion
                    <span className="tab-dot" />
                  </button>
                  {shader && (
                    <button className="active">
                      <Code2 size={14} />
                      {shader.name}
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label="Close shader"
                        onClick={() => setShaderId(null)}
                      >
                        <X size={12} />
                      </span>
                    </button>
                  )}
                  <button
                    className="compile-button"
                    title="Compile (Cmd/Ctrl + Enter)"
                    onClick={engine.recompile}
                  >
                    <Play size={12} /> Run
                  </button>
                </div>
                <CodeEditor
                  shaderId={shaderId}
                  onEditor={(e) => {
                    editor.current = e;
                  }}
                />
                <div className="editor-status">
                  <span>{shader ? "GLSL ES 3.00" : "MotionScript"}</span>
                  <span>
                    UTF-8 <span>·</span> Spaces: 4 <span>·</span> L
                    {selectedLine ?? 1}
                  </span>
                </div>
              </section>
              <div
                className="resize-handle vertical"
                role="separator"
                aria-label="Resize code panel"
                onPointerDown={(e) => resize(e, "code")}
              />
            </>
          )}
          <section className="preview-panel">
            <div className="panel-heading">
              <span>
                <Monitor size={14} /> Preview
              </span>
              <div>
                <select
                  aria-label="Preview resolution"
                  value={quality}
                  onChange={(e) =>
                    useStore.getState().set({ quality: Number(e.target.value) })
                  }
                >
                  <option value={1}>Full</option>
                  <option value={0.5}>½ resolution</option>
                  <option value={0.25}>¼ resolution</option>
                </select>
                <button
                  className="icon-button"
                  aria-label="Fullscreen preview"
                  title="Fullscreen (F)"
                  onClick={() => void preview.current?.requestFullscreen()}
                >
                  <Maximize2 size={14} />
                </button>
              </div>
            </div>
            <div className="preview-stage" ref={preview}>
              <div
                className="canvas-wrap"
                style={{
                  aspectRatio: `${project.settings.width}/${project.settings.height}`,
                }}
              >
                <canvas
                  ref={canvas}
                  aria-label="Motion preview"
                  onMouseMove={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    engine.mouse.current = screenToProject(
                      ((e.clientX - r.left) / r.width) * project.settings.width,
                      ((e.clientY - r.top) / r.height) *
                        project.settings.height,
                      project.settings.width,
                      project.settings.height,
                    );
                  }}
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    const point = screenToProject(
                      ((e.clientX - r.left) / r.width) * project.settings.width,
                      ((e.clientY - r.top) / r.height) *
                        project.settings.height,
                      project.settings.width,
                      project.settings.height,
                    );
                    const node = engine.renderer.current?.pick(
                      point.x,
                      point.y,
                    );
                    if (node) {
                      setShaderId(null);
                      useStore
                        .getState()
                        .set({ selectedLine: node.line, selectedAsset: null });
                    }
                  }}
                />
                {hits.map((hit) => (
                  <div
                    key={hit.node.id}
                    className="object-outline"
                    style={{
                      left: `${(hit.x / project.settings.width + 0.5) * 100}%`,
                      top: `${(0.5 - hit.y / project.settings.height) * 100}%`,
                      width: `${(hit.width / project.settings.width) * 100}%`,
                      height: `${(hit.height / project.settings.height) * 100}%`,
                    }}
                  />
                ))}
                {hits.map((hit) => (
                  <div
                    key={`anchor:${hit.node.id}`}
                    className="anchor-marker"
                    title="Anchor point"
                    style={{
                      left: `${(0.5 + hit.node.transform.position[0] / project.settings.width) * 100}%`,
                      top: `${(0.5 - hit.node.transform.position[1] / project.settings.height) * 100}%`,
                    }}
                  >
                    <span />
                    <span />
                  </div>
                ))}
              </div>
              {recording && (
                <div className="recording-label">
                  <span className="record-dot" /> Recording WebM
                </div>
              )}
            </div>
            <div className="transport">
              <div className="transport-time">
                <strong>
                  {String(Math.floor(time / 60)).padStart(2, "0")}:
                  {(time % 60).toFixed(2).padStart(5, "0")}
                </strong>
                <span>/ {project.settings.duration.toFixed(2)}s</span>
              </div>
              <div className="transport-buttons">
                <button
                  className="icon-button"
                  aria-label="Go to start"
                  onClick={() => useStore.getState().set({ time: 0 })}
                >
                  <SkipBack size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Previous frame"
                  onClick={() =>
                    useStore.getState().set({
                      playing: false,
                      time: Math.max(0, time - 1 / project.settings.fps),
                    })
                  }
                >
                  <SkipBack size={12} />
                </button>
                <button
                  className="play-button"
                  aria-label={playing ? "Pause" : "Play"}
                  onClick={() => void engine.toggle()}
                >
                  {playing ? <Pause size={18} /> : <Play size={18} />}
                </button>
                <button
                  className="icon-button"
                  aria-label="Next frame"
                  onClick={() =>
                    useStore.getState().set({
                      playing: false,
                      time: Math.min(
                        project.settings.duration,
                        time + 1 / project.settings.fps,
                      ),
                    })
                  }
                >
                  <SkipForward size={12} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Stop"
                  onClick={() =>
                    useStore.getState().set({ playing: false, time: 0 })
                  }
                >
                  <Square size={13} />
                </button>
              </div>
              <button
                className={`icon-button loop-button ${loop ? "enabled" : ""}`}
                aria-label="Toggle loop"
                aria-pressed={loop}
                onClick={() => useStore.getState().set({ loop: !loop })}
              >
                <Repeat size={16} />
              </button>
            </div>
            <input
              className="scrubber"
              type="range"
              aria-label="Current time"
              min={0}
              max={project.settings.duration}
              step={1 / project.settings.fps}
              value={time}
              onChange={(e) =>
                useStore.getState().set({ time: Number(e.target.value) })
              }
            />
            <div className="preview-footer">
              <span>
                {project.settings.width} × {project.settings.height}
              </span>
              <span>{project.settings.fps} fps</span>
            </div>
          </section>
        </div>
      </div>
      {bottomOpen && (
        <>
          <div
            className="resize-handle horizontal"
            role="separator"
            aria-label="Resize bottom panel"
            onPointerDown={(e) => resize(e, "bottom")}
          />
          <div style={{ height: bottomHeight }}>
            <BottomPanel
              nodes={engine.scene.nodes}
              compilation={engine.compilation}
              stats={engine.stats}
              objectBounds={engine.renderer.current?.hits ?? []}
              activeTab={bottomTab}
              onTab={setBottomTab}
              onClose={() => setBottomOpen(false)}
              onShader={(id) => setShaderId(id || null)}
            />
          </div>
        </>
      )}
      <footer className="app-status">
        <div>
          <button
            title="Toggle explorer"
            aria-label="Toggle explorer"
            onClick={() => setMediaOpen(!mediaOpen)}
          >
            <PanelLeftClose size={14} />
          </button>
          <button
            title="Toggle editor"
            aria-label="Toggle editor"
            onClick={() => setEditorOpen(!editorOpen)}
          >
            <Code2 size={14} />
          </button>
          <button
            title="Toggle bottom panel"
            aria-label="Toggle bottom panel"
            onClick={() => setBottomOpen(!bottomOpen)}
          >
            <PanelBottomClose size={14} />
          </button>
          <button
            className={diagnostics.length ? "status-error" : ""}
            onClick={() => {
              setBottomTab("console");
              setBottomOpen(true);
            }}
          >
            {diagnostics.length
              ? `${diagnostics.length} issue${diagnostics.length === 1 ? "" : "s"}`
              : "No problems"}
          </button>
        </div>
        <span className="keyboard-hint">⌘ Enter · Run</span>
        <span>MotionScript</span>
      </footer>
      {message && (
        <div className="toast" role="status">
          {message}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setMessage("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </main>
  );
}
function FileTab() {
  return <Code2 size={14} />;
}
