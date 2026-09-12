import { create } from "zustand";
import type { Project, Diagnostic } from "./types";
import { defaultProject } from "./defaults";
interface State {
  project: Project;
  past: Project[];
  future: Project[];
  time: number;
  playing: boolean;
  loop: boolean;
  quality: number;
  selectedAsset: string | null;
  selectedLine: number | null;
  diagnostics: Diagnostic[];
  revision: number;
  setProject: (p: Project, history?: boolean) => void;
  edit: (fn: (p: Project) => Project, history?: boolean) => void;
  undo: () => void;
  redo: () => void;
  set: (s: Partial<State>) => void;
}
export const useStore = create<State>((set, get) => ({
  project: defaultProject(),
  past: [],
  future: [],
  time: 1.8,
  playing: false,
  loop: true,
  quality: 0.5,
  selectedAsset: null,
  selectedLine: null,
  diagnostics: [],
  revision: 0,
  setProject: (project, history = true) =>
    set((s) => ({
      project,
      past: history ? [...s.past.slice(-39), s.project] : s.past,
      future: history ? [] : s.future,
      revision: s.revision + 1,
    })),
  edit: (fn, history = true) => get().setProject(fn(get().project), history),
  undo: () => {
    const { past, project } = get();
    if (!past.length) return;
    set((s) => ({
      project: past[past.length - 1],
      past: past.slice(0, -1),
      future: [project, ...s.future],
      revision: s.revision + 1,
    }));
  },
  redo: () => {
    const { future, project } = get();
    if (!future.length) return;
    set((s) => ({
      project: future[0],
      past: [...s.past, project],
      future: future.slice(1),
      revision: s.revision + 1,
    }));
  },
  set: (s) => set(s),
}));
