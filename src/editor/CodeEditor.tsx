import { useEffect, useRef } from "react";
import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/esm/vs/editor/editor.all.js";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { registerLanguage } from "./language";
import { useStore } from "../project/store";
import { assetCode } from "../assets/assets";
self.MonacoEnvironment = {
  getWorker() {
    return new EditorWorker();
  },
};
loader.config({ monaco });
registerLanguage(monaco);
export function CodeEditor({
  shaderId,
  onEditor,
}: {
  shaderId: string | null;
  onEditor: (e: monaco.editor.IStandaloneCodeEditor) => void;
}) {
  const project = useStore((s) => s.project),
    diagnostics = useStore((s) => s.diagnostics),
    selectedLine = useStore((s) => s.selectedLine);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null),
    decorations = useRef<monaco.editor.IEditorDecorationsCollection | null>(
      null,
    );
  const shader = project.assets.find((a) => a.id === shaderId);
  const value = shader?.data ?? project.code;
  useEffect(() => {
    const model = editor.current?.getModel();
    if (model)
      monaco.editor.setModelMarkers(
        model,
        "motion",
        diagnostics
          .filter((d) => (shader ? d.source === shader.name : !d.source))
          .map((d) => ({
            severity:
              d.severity === "error"
                ? monaco.MarkerSeverity.Error
                : monaco.MarkerSeverity.Warning,
            message: d.message + (d.suggestion ? "\n" + d.suggestion : ""),
            startLineNumber: d.line,
            startColumn: d.column,
            endLineNumber: d.line,
            endColumn: d.endColumn ?? d.column + 1,
          })),
      );
  }, [diagnostics, shader]);
  useEffect(() => {
    if (selectedLine && !shader && editor.current) {
      decorations.current?.clear();
      decorations.current = editor.current.createDecorationsCollection([
        {
          range: new monaco.Range(selectedLine, 1, selectedLine, 1),
          options: { isWholeLine: true, className: "source-selection" },
        },
      ]);
      editor.current.revealLineInCenterIfOutsideViewport(selectedLine);
    }
  }, [selectedLine, shader]);
  return (
    <div
      className="editor-body"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const a = useStore
          .getState()
          .project.assets.find(
            (a) => a.id === e.dataTransfer.getData("application/motion-asset"),
          );
        if (!a || !editor.current) return;
        const target = editor.current.getTargetAtClientPoint(
          e.clientX,
          e.clientY,
        );
        const p = target?.position ?? editor.current.getPosition()!;
        const text = e.dataTransfer.getData("application/motion-reference")
          ? JSON.stringify(a.name)
          : assetCode(a);
        editor.current.executeEdits("media-drop", [
          {
            range: new monaco.Range(
              p.lineNumber,
              p.column,
              p.lineNumber,
              p.column,
            ),
            text,
          },
        ]);
        editor.current.focus();
      }}
    >
      <Editor
        path={shader ? `${shader.id}.frag` : "main.motion"}
        language={shader ? "motion-glsl" : "motionscript"}
        theme="motion-dark"
        value={value}
        onChange={(v) => {
          if (v === undefined) return;
          useStore.getState().edit(
            (p) =>
              shader
                ? {
                    ...p,
                    assets: p.assets.map((a) =>
                      a.id === shader.id ? { ...a, data: v } : a,
                    ),
                  }
                : { ...p, code: v },
            false,
          );
        }}
        onMount={(e) => {
          editor.current = e;
          onEditor(e);
          e.onDidChangeCursorPosition((ev) => {
            if (e.getModel()?.uri.path.endsWith(".motion"))
              useStore.getState().set({ selectedLine: ev.position.lineNumber });
          });
        }}
        options={{
          fontSize: 13,
          fontFamily: '"SFMono-Regular", Consolas, monospace',
          lineHeight: 23,
          minimap: { enabled: false },
          padding: { top: 16, bottom: 24 },
          scrollBeyondLastLine: false,
          tabSize: 4,
          insertSpaces: true,
          automaticLayout: true,
          stickyScroll: { enabled: false },
          autoIndent: "full",
          autoClosingBrackets: "always",
          autoClosingQuotes: "always",
          formatOnPaste: true,
          wordWrap: "on",
          folding: true,
          colorDecorators: true,
          quickSuggestions: { other: true, strings: true, comments: false },
          suggestOnTriggerCharacters: true,
          bracketPairColorization: { enabled: true },
          renderLineHighlight: "line",
          overviewRulerBorder: false,
        }}
        loading={<div className="empty">Loading MotionScript editor…</div>}
      />
    </div>
  );
}
