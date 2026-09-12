import { legacyShaderSources, sampleShaders } from "../shaders/preprocess";
import {
  demoCode,
  legacyDemoCode,
  downwardDemoCode,
  previousAnchorDemoCode,
} from "./defaults";
import type { Project } from "./types";
export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2);
}
export function deserializeProject(input: string): Project {
  const p = JSON.parse(input);
  if (p.version !== 1)
    throw new Error(`Unsupported .motion version: ${p.version}`);
  if (
    typeof p.code !== "string" ||
    typeof p.name !== "string" ||
    !Array.isArray(p.assets) ||
    !p.settings
  )
    throw new Error(
      "Invalid .motion project: code, settings and assets are required.",
    );
  for (const key of ["width", "height", "fps", "duration"])
    if (!Number.isFinite(p.settings[key]) || p.settings[key] <= 0)
      throw new Error(`Invalid project ${key}.`);
  if (
    p.settings.width > 8192 ||
    p.settings.height > 8192 ||
    p.settings.fps > 240 ||
    p.settings.duration > 3600
  )
    throw new Error("Project limits: 8192px, 240fps, 3600 seconds.");
  const ids = new Set<string>();
  for (const a of p.assets) {
    if (
      typeof a.id !== "string" ||
      typeof a.name !== "string" ||
      typeof a.data !== "string" ||
      !["image", "video", "audio", "font", "shader"].includes(a.type) ||
      ids.has(a.id)
    )
      throw new Error("Invalid or duplicate media asset.");
    ids.add(a.id);
    a.aliases ??= [];
    a.metadata ??= {};
    if (a.type === "shader" && a.data === legacyShaderSources[a.name])
      a.data = sampleShaders[a.name];
  }
  if (
    p.code === legacyDemoCode ||
    p.code === downwardDemoCode ||
    p.code === previousAnchorDemoCode
  )
    p.code = demoCode;
  p.uniformValues ??= {};
  p.settings.seed ??= 42;
  p.settings.background ??= "#101716";
  return p as Project;
}
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("motioncode", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("projects");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function saveLocal(project: Project) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("projects", "readwrite");
      tx.objectStore("projects").put(project, "current");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function loadLocal(): Promise<Project | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction("projects")
        .objectStore("projects")
        .get("current");
      request.onsuccess = () =>
        resolve(
          request.result
            ? deserializeProject(JSON.stringify(request.result))
            : undefined,
        );
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
export function download(data: Blob, name: string) {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
