import type { Asset, Settings } from "../project/types";
import type { SceneNode, FrameContext } from "../runtime/types";
import { preprocessShader } from "../shaders/preprocess";
import { drawableGeometry } from "../runtime/geometry";
import { projectToClip } from "../runtime/coordinates";
import { parseColor } from "../runtime/ease";
const vertex = `#version 300 es
in vec2 a_position; in vec2 a_uv; out vec2 v_uv;
void main(){gl_Position=vec4(a_position,0.,1.);v_uv=a_uv;}`;
const fragment = `#version 300 es
precision highp float;
uniform sampler2D u_image; uniform vec4 u_color; uniform bool u_target; in vec2 v_uv; out vec4 outColor;
void main(){vec4 value=texture(u_image,v_uv);if(u_target && value.a>0.00001)value.rgb/=value.a;outColor=value*u_color;}`;
const composite = `#version 300 es
precision highp float;
uniform sampler2D u_image;uniform sampler2D u_back;uniform int u_mode;in vec2 v_uv;out vec4 outColor;
void main(){vec4 s=texture(u_image,v_uv),d=texture(u_back,v_uv);s.rgb/=max(s.a,.00001);d.rgb/=max(d.a,.00001);vec3 c=s.rgb;
if(u_mode==1)c=s.rgb*d.rgb;if(u_mode==2)c=1.-(1.-s.rgb)*(1.-d.rgb);
if(u_mode==3)c=mix(2.*s.rgb*d.rgb,1.-2.*(1.-s.rgb)*(1.-d.rgb),step(vec3(.5),d.rgb));
if(u_mode==4)c=abs(d.rgb-s.rgb);if(u_mode==5)c=min(vec3(1.),s.rgb+d.rgb);
float a=s.a+d.a*(1.-s.a);vec3 rgb=(s.a*(1.-d.a)*s.rgb+s.a*d.a*c+(1.-s.a)*d.a*d.rgb);outColor=vec4(rgb,a);}`;
interface Target {
  texture: WebGLTexture;
  fb: WebGLFramebuffer;
}
interface TextureInfo {
  texture: WebGLTexture;
  width: number;
  height: number;
  video?: HTMLVideoElement;
}
export interface RenderStats {
  drawCalls: number;
  textures: number;
  gpuPasses: number;
  renderMs: number;
}
export interface Hit {
  node: SceneNode;
  localWidth: number;
  localHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
}
/** All backends consume the runtime scene graph. GPU resources are owned and reclaimed here. */
export class WebGLRenderer {
  readonly gl: WebGL2RenderingContext;
  private basic: WebGLProgram;
  private composite: WebGLProgram;
  private buffer: WebGLBuffer;
  private vao: WebGLVertexArrayObject;
  private programs = new Map<
    string,
    { source: string; program: WebGLProgram }
  >();
  private textures = new Map<string, TextureInfo>();
  private pending = new Set<string>();
  private targets: Target[] = [];
  private used = 0;
  private assets: Asset[] = [];
  private assetData = new Map<string, string>();
  private w = 0;
  private h = 0;
  private ctx!: FrameContext;
  private settings!: Settings;
  private disposed = false;
  hits: Hit[] = [];
  stats: RenderStats = { drawCalls: 0, textures: 0, gpuPasses: 0, renderMs: 0 };
  onError: (message: string, source?: string) => void = () => {};
  onInvalidate: () => void = () => {};
  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    if (!gl)
      throw new Error(
        "WebGL2 is unavailable. Enable hardware acceleration or use a compatible browser.",
      );
    this.gl = gl;
    this.basic = this.program(fragment);
    this.composite = this.program(composite);
    this.buffer = gl.createBuffer()!;
    this.vao = gl.createVertexArray()!;
  }
  private program(source: string): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, code: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, code);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s) || "Shader compilation failed";
        gl.deleteShader(s);
        throw new Error(log);
      }
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, vertex);
    let fs: WebGLShader;
    try {
      fs = compile(gl.FRAGMENT_SHADER, source);
    } catch (e) {
      gl.deleteShader(vs);
      throw e;
    }
    const p = gl.createProgram()!;
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(p) || "Shader link failed";
      gl.deleteProgram(p);
      throw new Error(log);
    }
    return p;
  }
  invalidateText() {
    for (const [key, texture] of this.textures) {
      if (key.startsWith("text:")) {
        this.gl.deleteTexture(texture.texture);
        this.textures.delete(key);
      }
    }
    this.onInvalidate();
  }
  setAssets(assets: Asset[]) {
    this.assets = assets;
    for (const [id, data] of this.assetData) {
      if (assets.find((a) => a.id === id)?.data !== data) {
        const t = this.textures.get(id);
        if (t) {
          t.video?.pause();
          this.gl.deleteTexture(t.texture);
          this.textures.delete(id);
        }
        this.assetData.delete(id);
      }
    }
    for (const a of assets) {
      if (
        a.type === "font" &&
        !a.metadata.builtin &&
        this.assetData.get(a.id) !== a.data
      ) {
        this.assetData.set(a.id, a.data);
        const font = new FontFace(a.id, `url(${a.data})`);
        font
          .load()
          .then((f) => {
            if (this.disposed) return;
            document.fonts.add(f);
            for (const [key, t] of this.textures)
              if (key.startsWith("text:")) {
                this.gl.deleteTexture(t.texture);
                this.textures.delete(key);
              }
            this.onInvalidate();
          })
          .catch(() => this.onError(`Cannot load font ${a.name}`));
      }
    }
  }
  private texture(source: TexImageSource): TextureInfo {
    const gl = this.gl,
      t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    const s = source as HTMLCanvasElement;
    return { texture: t, width: s.width, height: s.height };
  }
  private getTexture(node: SceneNode): TextureInfo | undefined {
    if (
      node.kind === "text" ||
      node.kind === "rect" ||
      node.kind === "circle"
    ) {
      const key =
        node.kind === "text"
          ? `text:${node.text}:${node.assetId}:${node.size}:${node.weight}:${node.letterSpacing}:${node.stroke}`
          : `shape:${node.kind}:${node.width}:${node.height}`;
      const cached = this.textures.get(key);
      if (cached) return cached;
      const c = document.createElement("canvas"),
        g = c.getContext("2d")!;
      const size = node.size ?? 120;
      const a = this.assets.find((a) => a.id === node.assetId);
      const family =
        a && !a.metadata.builtin ? `"${a.id}"` : '"Inter", sans-serif';
      g.font = `${node.weight} ${size}px ${family}`;
      if (node.kind === "text") {
        const lines = (node.text ?? "").split("\n");
        c.width = Math.max(
          1,
          Math.ceil(
            Math.max(
              ...lines.map(
                (l) =>
                  g.measureText(l).width +
                  Math.max(0, l.length - 1) * (node.letterSpacing ?? 0),
              ),
            ) +
              size * 0.3 +
              (node.stroke ?? 0) * 2,
          ),
        );
        c.height = Math.ceil(size * 1.35 * lines.length);
        g.font = `${node.weight} ${size}px ${family}`;
        g.textBaseline = "top";
        g.fillStyle = "white";
        g.strokeStyle = "white";
        g.lineWidth = node.stroke ?? 0;
        lines.forEach((l, i) => {
          let x = size * 0.1;
          for (const ch of l) {
            if (node.stroke) g.strokeText(ch, x, i * size * 1.35 + size * 0.1);
            g.fillText(ch, x, i * size * 1.35 + size * 0.1);
            x += g.measureText(ch).width + (node.letterSpacing ?? 0);
          }
        });
      } else {
        c.width = Math.max(1, node.width ?? 200);
        c.height = Math.max(1, node.height ?? 200);
        g.fillStyle = "white";
        if (node.kind === "circle") {
          g.beginPath();
          g.ellipse(
            c.width / 2,
            c.height / 2,
            c.width / 2,
            c.height / 2,
            0,
            0,
            Math.PI * 2,
          );
          g.fill();
        } else g.fillRect(0, 0, c.width, c.height);
      }
      const t = this.texture(c);
      this.textures.set(key, t);
      if (this.textures.size > 500) {
        const first = this.textures.keys().next().value!;
        if (first !== key) {
          this.gl.deleteTexture(this.textures.get(first)!.texture);
          this.textures.delete(first);
        }
      }
      return t;
    }
    const id = node.assetId!,
      a = this.assets.find((a) => a.id === id);
    if (!a) return;
    const cached = this.textures.get(id);
    if (cached) {
      if (cached.video) {
        const video = cached.video;
        const target = Math.max(0, this.ctx.time - node.t1);
        if (
          Number.isFinite(video.duration) &&
          Math.abs(video.currentTime - Math.min(target, video.duration)) >
            0.03 &&
          !video.seeking
        )
          video.currentTime = Math.min(target, video.duration);
        if (video.readyState >= 2) {
          this.gl.bindTexture(this.gl.TEXTURE_2D, cached.texture);
          this.gl.texImage2D(
            this.gl.TEXTURE_2D,
            0,
            this.gl.RGBA,
            this.gl.RGBA,
            this.gl.UNSIGNED_BYTE,
            video,
          );
        }
      }
      return cached;
    }
    if (this.pending.has(id)) return;
    this.pending.add(id);
    this.assetData.set(id, a.data);
    if (a.type === "video") {
      const v = document.createElement("video");
      v.src = a.data;
      v.muted = true;
      v.preload = "auto";
      v.playsInline = true;
      v.onloadeddata = () => {
        if (this.disposed) return;
        const t = this.texture(v);
        t.width = v.videoWidth;
        t.height = v.videoHeight;
        t.video = v;
        this.textures.set(id, t);
        this.pending.delete(id);
        this.onInvalidate();
      };
      v.onseeked = () => this.onInvalidate();
      v.onerror = () => {
        this.pending.delete(id);
        this.onError(
          `Cannot decode video ${a.name}. Codec support depends on the browser.`,
        );
      };
    } else {
      const img = new Image();
      img.onload = () => {
        if (this.disposed) return;
        this.textures.set(id, this.texture(img));
        this.pending.delete(id);
        this.onInvalidate();
      };
      img.onerror = () => {
        this.pending.delete(id);
        this.onError(`Cannot decode image ${a.name}`);
      };
      img.src = a.data;
    }
  }
  private target(): Target {
    const gl = this.gl;
    let t = this.targets[this.used++];
    if (!t) {
      const texture = gl.createTexture()!,
        fb = gl.createFramebuffer()!;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        this.w,
        this.h,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        texture,
        0,
      );
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
        throw new Error(
          "Cannot allocate render target. Reduce preview resolution.",
        );
      t = { texture, fb };
      this.targets.push(t);
    }
    return t;
  }
  private bind(target: Target | null, clear = false) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target?.fb ?? null);
    gl.viewport(0, 0, this.w, this.h);
    if (clear) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
  }
  private quad(
    program: WebGLProgram,
    texture: WebGLTexture,
    points: number[],
    color = [1, 1, 1, 1],
    flip = false,
  ) {
    const gl = this.gl;
    gl.useProgram(program);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const uv = flip
      ? [
          [0, 1],
          [1, 1],
          [0, 0],
          [0, 0],
          [1, 1],
          [1, 0],
        ]
      : [
          [0, 0],
          [1, 0],
          [0, 1],
          [0, 1],
          [1, 0],
          [1, 1],
        ];
    const data = new Float32Array(24);
    for (let i = 0; i < 6; i++) {
      data[i * 4] = points[i * 2];
      data[i * 4 + 1] = points[i * 2 + 1];
      data[i * 4 + 2] = uv[i][0];
      data[i * 4 + 3] = uv[i][1];
    }
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    for (const [name, offset] of [
      ["a_position", 0],
      ["a_uv", 8],
    ] as const) {
      const loc = gl.getAttribLocation(program, name);
      if (loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 16, offset);
      }
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(gl.getUniformLocation(program, "u_image"), 0);
    gl.uniform4fv(gl.getUniformLocation(program, "u_color"), color);
    // Framebuffers store premultiplied color; uploaded image textures are straight alpha.
    gl.uniform1i(gl.getUniformLocation(program, "u_target"), flip ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.stats.drawCalls++;
  }
  private full = [-1, 1, 1, 1, -1, -1, -1, -1, 1, 1, 1, -1];
  private blending() {
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(
      gl.SRC_ALPHA,
      gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA,
    );
  }
  private drawNodes(nodes: SceneNode[], target: Target | null) {
    for (const node of [...nodes].sort(
      (a, b) => a.transform.position[2] - b.transform.position[2],
    )) {
      if (this.ctx.time < node.t1 || this.ctx.time >= node.t2) continue;
      const needsTarget =
        node.kind === "group" ||
        node.shaders.length > 0 ||
        node.transform.blend !== "normal";
      if (needsTarget) {
        const saved = this.used;
        let layer = this.target();
        this.bind(layer, true);
        this.blending();
        if (node.kind === "group") this.drawNodes(node.children ?? [], layer);
        else this.drawOne(node);
        for (const pass of node.shaders) {
          const asset = this.assets.find((a) => a.id === pass.assetId);
          if (!asset) continue;
          let cached = this.programs.get(asset.id);
          if (cached?.source !== asset.data) {
            try {
              const processed = preprocessShader(asset.data);
              const p = this.program(processed.source);
              if (cached) this.gl.deleteProgram(cached.program);
              cached = { source: asset.data, program: p };
              this.programs.set(asset.id, cached);
            } catch (e) {
              this.onError(String(e), asset.name);
              continue;
            }
          }
          if (!cached) continue;
          const output = this.target(),
            gl = this.gl,
            p = cached.program;
          this.bind(output, true);
          gl.disable(gl.BLEND);
          gl.useProgram(p);
          gl.uniform2f(
            gl.getUniformLocation(p, "u_resolution"),
            this.settings.width,
            this.settings.height,
          );
          gl.uniform2f(
            gl.getUniformLocation(p, "_motion_resolution"),
            this.w,
            this.h,
          );
          gl.uniform1f(gl.getUniformLocation(p, "u_time"), this.ctx.time);
          gl.uniform2f(
            gl.getUniformLocation(p, "u_mouse"),
            this.ctx.mouse.x,
            this.ctx.mouse.y,
          );
          for (const u of preprocessShader(asset.data).uniforms) {
            const loc = gl.getUniformLocation(p, u.name),
              v = pass.uniforms[u.name] ?? u.defaultValue;
            if (u.type === "bool" || u.type === "int")
              gl.uniform1i(loc, Number(v));
            else if (u.type === "float") gl.uniform1f(loc, Number(v));
            else if (u.type === "vec2") gl.uniform2fv(loc, v as number[]);
            else if (u.type === "vec3") gl.uniform3fv(loc, v as number[]);
            else gl.uniform4fv(loc, v as number[]);
          }
          this.quad(p, layer.texture, this.full, [1, 1, 1, 1], true);
          layer = output;
          this.stats.gpuPasses++;
        }
        this.bind(target);
        if (node.transform.blend !== "normal") {
          const gl = this.gl,
            back = this.target();
          this.bind(target);
          gl.bindTexture(gl.TEXTURE_2D, back.texture);
          gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, this.w, this.h);
          this.bind(target);
          gl.disable(gl.BLEND);
          gl.useProgram(this.composite);
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, back.texture);
          gl.uniform1i(gl.getUniformLocation(this.composite, "u_back"), 1);
          gl.uniform1i(
            gl.getUniformLocation(this.composite, "u_mode"),
            (
              {
                multiply: 1,
                screen: 2,
                overlay: 3,
                difference: 4,
                add: 5,
              } as Record<string, number>
            )[node.transform.blend] ?? 0,
          );
          this.quad(
            this.composite,
            layer.texture,
            this.full,
            [1, 1, 1, 1],
            true,
          );
        } else {
          this.blending();
          this.quad(
            this.basic,
            layer.texture,
            this.full,
            [1, 1, 1, node.kind === "group" ? node.transform.opacity : 1],
            true,
          );
        }
        this.used = saved;
      } else {
        this.bind(target);
        this.blending();
        this.drawOne(node);
      }
    }
  }
  private drawOne(node: SceneNode) {
    const t = this.getTexture(node);
    if (!t) return;
    const transform = node.transform;
    const geometry = drawableGeometry(t.width, t.height, transform);
    const corners = [0, 1, 2, 2, 1, 3].flatMap((index) => {
      const point = geometry.corners[index];
      return projectToClip(
        point.x,
        point.y,
        this.settings.width,
        this.settings.height,
      );
    });
    const c = parseColor(node.color) ?? [1, 1, 1, 1];
    c[3] = Math.max(0, Math.min(1, transform.opacity));
    this.quad(this.basic, t.texture, corners, c);
    this.hits.push({
      node,
      ...geometry.bounds,
      localWidth: t.width,
      localHeight: t.height,
    });
  }
  render(
    nodes: SceneNode[],
    ctx: FrameContext,
    settings: Settings,
    quality: number,
  ) {
    const begin = performance.now();
    this.ctx = ctx;
    this.settings = settings;
    const w = Math.max(1, Math.round(settings.width * quality)),
      h = Math.max(1, Math.round(settings.height * quality));
    if (this.w !== w || this.h !== h) {
      this.w = w;
      this.h = h;
      this.canvas.width = w;
      this.canvas.height = h;
      for (const t of this.targets) {
        this.gl.deleteTexture(t.texture);
        this.gl.deleteFramebuffer(t.fb);
      }
      this.targets = [];
    }
    this.used = 0;
    this.hits = [];
    this.stats = {
      drawCalls: 0,
      textures: this.textures.size,
      gpuPasses: 0,
      renderMs: 0,
    };
    this.bind(null);
    const c = parseColor(settings.background) ?? [0, 0, 0, 1];
    this.gl.clearColor(...c);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.drawNodes(nodes, null);
    this.stats.textures = this.textures.size;
    this.stats.renderMs = performance.now() - begin;
  }
  pick(x: number, y: number) {
    return [...this.hits]
      .reverse()
      .find(
        (h) =>
          x >= h.x && x <= h.x + h.width && y <= h.y && y >= h.y - h.height,
      )?.node;
  }
  dispose() {
    this.disposed = true;
    for (const t of this.textures.values()) {
      t.video?.pause();
      this.gl.deleteTexture(t.texture);
    }
    for (const t of this.targets) {
      this.gl.deleteTexture(t.texture);
      this.gl.deleteFramebuffer(t.fb);
    }
    for (const p of this.programs.values()) this.gl.deleteProgram(p.program);
    this.gl.deleteProgram(this.basic);
    this.gl.deleteProgram(this.composite);
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteVertexArray(this.vao);
  }
}
