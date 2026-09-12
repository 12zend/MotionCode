import { useEffect, useRef, useState } from "react";
import { useStore } from "../project/store";
import { WebGLRenderer, type RenderStats } from "../renderer/WebGLRenderer";
import { AudioEngine } from "../audio/AudioEngine";
import { preprocessShader } from "../shaders/preprocess";
import type { Compilation } from "../compiler";
import type { FrameContext, SceneFrame } from "../runtime/types";
export function useEngine(canvas: React.RefObject<HTMLCanvasElement | null>) {
  const project = useStore((s) => s.project),
    revision = useStore((s) => s.revision);
  const renderer = useRef<WebGLRenderer | null>(null),
    audio = useRef<AudioEngine | null>(null),
    worker = useRef<Worker | null>(null);
  const [compilation, setCompilation] = useState<Compilation | null>(null),
    [scene, setScene] = useState<SceneFrame>({ nodes: [], audioRequests: [] }),
    [stats, setStats] = useState<RenderStats>({
      drawCalls: 0,
      textures: 0,
      gpuPasses: 0,
      renderMs: 0,
    });
  const lastScene = useRef<SceneFrame>({ nodes: [], audioRequests: [] }),
    busy = useRef(false),
    compiled = useRef(false),
    compileId = useRef(0),
    frameId = useRef(0),
    deadline = useRef(0),
    mouse = useRef({ x: 0, y: 0 }),
    lastStats = useRef(0),
    dirty = useRef(true),
    lastFrame = useRef("");
  const context = (): FrameContext => {
    const s = useStore.getState(),
      p = s.project;
    return {
      time: s.time,
      frame: Math.floor(s.time * p.settings.fps),
      ...p.settings,
      mouse: mouse.current,
      audio: audio.current?.levels() ?? { level: 0, bass: 0, mid: 0, high: 0 },
    };
  };
  const fail = (message: string, source?: string) => {
    const s = useStore.getState();
    if (
      !s.diagnostics.some((d) => d.message === message && d.source === source)
    )
      s.set({
        diagnostics: [
          ...s.diagnostics.slice(-49),
          {
            severity: "error",
            message,
            line: source
              ? Math.max(
                  1,
                  Number(message.match(/ERROR:\s*\d+:(\d+)/)?.[1] ?? 1) -
                    preprocessShader(
                      s.project.assets.find((a) => a.name === source)?.data ??
                        "",
                    ).lineOffset,
                )
              : Number(message.match(/Line (\d+):/)?.[1] ?? 1),
            column: 1,
            source,
          },
        ],
      });
  };
  useEffect(() => {
    if (!canvas.current) return;
    try {
      renderer.current = new WebGLRenderer(canvas.current);
    } catch (e) {
      fail(String(e));
      return;
    }
    audio.current = new AudioEngine();
    renderer.current.onError = fail;
    renderer.current.onInvalidate = () => {
      dirty.current = true;
    };
    renderer.current.setAssets(useStore.getState().project.assets);
    document.fonts.ready.then(() => {
      renderer.current?.invalidateText();
      dirty.current = true;
    });
    let w = new Worker(new URL("../runtime/worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    const handleMessage = ({ data }: MessageEvent) => {
      if (data.type === "compiled") {
        if (data.requestId !== compileId.current) return;
        setCompilation(data.result);
        useStore.getState().set({ diagnostics: data.result.diagnostics });
        compiled.current = !data.result.diagnostics.some(
          (d: { severity: string }) => d.severity === "error",
        );
        dirty.current = true;
        deadline.current = 0;
      } else if (data.type === "frame") {
        busy.current = false;
        deadline.current = 0;
        lastScene.current = data.scene;
        const s = useStore.getState();
        try {
          renderer.current?.render(
            data.scene.nodes,
            context(),
            s.project.settings,
            s.quality,
          );
          audio.current?.sync(
            data.scene.audioRequests,
            s.project.assets,
            s.time,
            s.playing,
          );
        } catch (e) {
          fail(String(e));
        }
        if (performance.now() - lastStats.current > 150) {
          setScene(data.scene);
          setStats({ ...renderer.current!.stats });
          lastStats.current = performance.now();
        }
      } else {
        busy.current = false;
        deadline.current = 0;
        compiled.current = false;
        useStore.getState().set({ playing: false });
        fail(data.message);
      }
    };
    w.onmessage = handleMessage;
    let raf = 0,
      previous = performance.now();
    const tick = (now: number) => {
      const s = useStore.getState();
      if (deadline.current && now > deadline.current) {
        w.terminate();
        compiled.current = false;
        busy.current = false;
        deadline.current = 0;
        s.set({ playing: false });
        fail(
          "Program exceeded the 2 second execution limit. Fix the loop and compile again.",
        );
        w = new Worker(new URL("../runtime/worker.ts", import.meta.url), {
          type: "module",
        });
        worker.current = w;
        w.onmessage = handleMessage;
      }
      if (s.playing) {
        let time = s.time + (now - previous) / 1000;
        if (time >= s.project.settings.duration) {
          if (s.loop) time %= s.project.settings.duration;
          else {
            time = s.project.settings.duration;
            s.set({ playing: false });
          }
        }
        s.set({ time });
      }
      previous = now;
      const key = `${s.time}:${s.quality}:${s.revision}:${JSON.stringify(mouse.current)}`;
      if (
        compiled.current &&
        !busy.current &&
        (dirty.current || key !== lastFrame.current)
      ) {
        dirty.current = false;
        lastFrame.current = key;
        busy.current = true;
        deadline.current = now + 2000;
        w.postMessage({
          type: "frame",
          requestId: ++frameId.current,
          context: context(),
          uniformValues: s.project.uniformValues,
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      w.terminate();
      renderer.current?.dispose();
      audio.current?.dispose();
    };
  }, []);
  useEffect(() => {
    renderer.current?.setAssets(project.assets);
    const timer = setTimeout(() => {
      if (!worker.current) return;
      deadline.current = performance.now() + 2000;
      worker.current.postMessage({
        type: "compile",
        requestId: ++compileId.current,
        code: project.code,
        assets: project.assets,
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [project.code, project.assets]);
  useEffect(() => {
    dirty.current = true;
  }, [revision]);
  const toggle = async () => {
    const s = useStore.getState();
    if (!s.playing) {
      await audio.current?.resume().catch((e) => fail(String(e)));
      if (s.time >= s.project.settings.duration) s.set({ time: 0 });
    }
    s.set({ playing: !s.playing });
  };
  return {
    renderer,
    audio,
    compilation,
    scene,
    stats,
    mouse,
    toggle,
    recompile: () => {
      dirty.current = true;
      worker.current?.postMessage({
        type: "compile",
        requestId: ++compileId.current,
        code: useStore.getState().project.code,
        assets: useStore.getState().project.assets,
      });
    },
  };
}
