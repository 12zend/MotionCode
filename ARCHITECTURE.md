# Architecture

MotionScript → Acorn tokenizer → extended JavaScript AST → semantic analysis → Motion IR → instrumented JavaScript → per-frame scene graph → WebGL2.

The compiler retains ESTree and source locations, lowering `group {}` to a scoped scene construction operation. Motion IR describes drawable call sites, dependencies, diagnostics and generated code. Evaluation runs in a Worker with a bounded response deadline, keeping malformed or expensive user programs off the UI thread. The renderer only consumes serializable scene nodes and explicit frame state.

Assets have UUIDs; source names resolve to UUIDs at compile time. Rename refactors asset literal references, while aliases retain older references. Project serialization embeds bytes and shader text, is versioned, and IndexedDB stores the same project model.

The WebGL renderer rasterizes text to cached high resolution textures and composites transformed quads. Every group with effects renders to an offscreen target; shader passes ping-pong before compositing into its parent. GLSL preprocessing translates the friendly main(image)/return vec3 syntax and reflects uniforms for property controls.

## Files
- `src/compiler`: lexer/parser/semantic/IR/code generation and diagnostics
- `src/runtime`: scene graph, easing, frame execution Worker
- `src/renderer`: WebGL2 resources, textures, compositing and picking
- `src/shaders`: preprocessing, uniform reflection and bundled examples
- `src/assets`: asset identity, import, references
- `src/project`: versioned persistence, defaults, undoable state
- `src/editor`: Monaco syntax, completion, colors and diagnostics
- `src/audio`: playback and frequency analysis
- `src/export`: same-canvas frame and WebM export
- `src/ui`: IDE panels, timeline, properties

Future backends consume the same scene graph. Export supplies explicit times to the same evaluator and renderer; preview does not own animation state.
