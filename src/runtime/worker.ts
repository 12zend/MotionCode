import { compile } from "../compiler";
import { createEvaluator } from "./evaluate";
let evaluate: ReturnType<typeof createEvaluator> | undefined;
let lastKey = "";
let cached: ReturnType<typeof compile> | undefined;
self.onmessage = ({ data }) => {
  try {
    if (data.type === "compile") {
      const key = JSON.stringify([
        data.code,
        data.assets.map(
          (a: {
            id: string;
            name: string;
            aliases: string[];
            type: string;
          }) => [a.id, a.name, a.aliases, a.type],
        ),
      ]);
      const result =
        key === lastKey && cached
          ? { ...cached, compileMs: 0 }
          : compile(data.code, data.assets);
      lastKey = key;
      cached = result;
      if (!result.diagnostics.some((d) => d.severity === "error"))
        evaluate = createEvaluator(result.code, data.assets);
      self.postMessage({ type: "compiled", requestId: data.requestId, result });
    } else if (data.type === "frame") {
      self.postMessage({
        type: "frame",
        requestId: data.requestId,
        scene: evaluate?.(data.context, data.uniformValues) ?? {
          nodes: [],
          audioRequests: [],
        },
      });
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      requestId: data.requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
