export type Blend =
  "normal" | "add" | "screen" | "multiply" | "overlay" | "difference";
export interface Transform {
  position: [number, number, number];
  scale: [number, number];
  rotation: number;
  anchorPoint: [number, number];
  opacity: number;
  blend: Blend;
}
export interface ShaderPass {
  assetId: string;
  uniforms: Record<string, number | number[] | boolean>;
}
export interface SceneNode {
  id: string;
  kind: "text" | "draw" | "rect" | "circle" | "group";
  line: number;
  transform: Transform;
  t1: number;
  t2: number;
  color: string;
  text?: string;
  assetId?: string;
  font?: string;
  size?: number;
  weight?: number;
  letterSpacing?: number;
  stroke?: number;
  width?: number;
  height?: number;
  children?: SceneNode[];
  shaders: ShaderPass[];
}
export interface FrameContext {
  time: number;
  frame: number;
  fps: number;
  width: number;
  height: number;
  duration: number;
  seed: number;
  mouse: { x: number; y: number };
  audio: { level: number; bass: number; mid: number; high: number };
}
export interface SceneFrame {
  nodes: SceneNode[];
  audioRequests: { assetId: string; volume: number; start: number }[];
}
