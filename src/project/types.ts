export type AssetType = "image" | "video" | "audio" | "font" | "shader";
export interface Asset {
  id: string;
  name: string;
  aliases: string[];
  type: AssetType;
  originalName: string;
  mimeType: string;
  data: string;
  metadata: {
    size?: number;
    width?: number;
    height?: number;
    duration?: number;
    builtin?: boolean;
  };
}
export interface Settings {
  width: number;
  height: number;
  fps: number;
  duration: number;
  background: string;
  seed: number;
}
export interface Project {
  version: 1;
  id: string;
  name: string;
  settings: Settings;
  code: string;
  assets: Asset[];
  uniformValues: Record<string, Record<string, number | number[] | boolean>>;
}
export interface Diagnostic {
  severity: "error" | "warning";
  message: string;
  line: number;
  column: number;
  endColumn?: number;
  source?: string;
  suggestion?: string;
}
