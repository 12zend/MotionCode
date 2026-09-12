import type { Project } from "./types";
import { download, serializeProject } from "./persistence";

/** A selected handle is authority to replace that file, never an inferred path. */
export interface MotionFileHandle {
  readonly name: string;
  createWritable(): Promise<{
    write(data: string): Promise<void>;
    close(): Promise<void>;
    abort?(): Promise<void>;
  }>;
  queryPermission?(descriptor: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission?(descriptor: {
    mode: "readwrite";
  }): Promise<PermissionState>;
}
export type SavePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<MotionFileHandle>;
export interface FileSaveResult {
  name: string;
  mode: "file" | "download";
}

export class ProjectFileWriter {
  private handle: MotionFileHandle | null = null;
  private projectId: string | null = null;
  private pending: Promise<FileSaveResult> | null = null;
  constructor(
    private picker: SavePicker | undefined,
    private remember: (
      id: string,
      handle: MotionFileHandle,
    ) => Promise<void> = async () => {},
    private fallback = download,
  ) {}
  setTarget(projectId: string, handle: MotionFileHandle | null) {
    this.projectId = projectId;
    this.handle = handle;
  }
  get targetName() {
    return this.handle?.name ?? null;
  }
  async save(project: Project, saveAs = false): Promise<FileSaveResult> {
    // Serialize writes so rapid Cmd+S cannot race two writable streams.
    while (this.pending) await this.pending.catch(() => {});
    const pending = this.write(project, saveAs);
    this.pending = pending;
    try {
      return await pending;
    } finally {
      if (this.pending === pending) this.pending = null;
    }
  }
  private async write(
    project: Project,
    saveAs: boolean,
  ): Promise<FileSaveResult> {
    if (!this.picker) {
      const name = `${project.name}.motion`;
      this.fallback(
        new Blob([serializeProject(project)], { type: "application/json" }),
        name,
      );
      return { name, mode: "download" };
    }
    let handle = this.projectId === project.id && !saveAs ? this.handle : null;
    if (!handle) {
      handle = await this.picker({
        suggestedName: `${project.name}.motion`,
        types: [
          {
            description: "MotionCode project",
            accept: { "application/json": [".motion"] },
          },
        ],
      });
    }
    if (
      handle.queryPermission &&
      (await handle.queryPermission({ mode: "readwrite" })) !== "granted"
    ) {
      if (
        !handle.requestPermission ||
        (await handle.requestPermission({ mode: "readwrite" })) !== "granted"
      ) {
        throw new Error(
          "このファイルへの書き込みが許可されませんでした。「別名で保存」で保存先を選択できます。",
        );
      }
    }
    const writable = await handle.createWritable();
    try {
      // createWritable() uses a replacement stream; close commits the complete project.
      await writable.write(serializeProject(project));
      await writable.close();
    } catch (error) {
      await writable.abort?.().catch(() => {});
      throw error;
    }
    this.setTarget(project.id, handle);
    // A browser can reject handle persistence while still supporting this session's writes.
    await this.remember(project.id, handle).catch(() => {});
    return { name: handle.name, mode: "file" };
  }
}

export function browserSavePicker(): SavePicker | undefined {
  const picker = (window as Window & { showSaveFilePicker?: SavePicker })
    .showSaveFilePicker;
  return picker?.bind(window);
}
async function handleDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("motioncode-file-handles", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("handles");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function rememberFileHandle(
  id: string,
  handle: MotionFileHandle | null,
) {
  const db = await handleDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("handles", "readwrite");
      tx.objectStore("handles").put(handle, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function restoreFileHandle(
  id: string,
): Promise<MotionFileHandle | null> {
  const db = await handleDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("handles").objectStore("handles").get(id);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
