import { download } from "../project/persistence";
export async function exportFrame(
  canvas: HTMLCanvasElement,
  name: string,
  type = "image/png",
) {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type),
  );
  if (!blob) throw new Error("Unable to capture the preview.");
  download(blob, `${name}.${type === "image/png" ? "png" : "webp"}`);
}
export function startWebM(
  canvas: HTMLCanvasElement,
  fps: number,
  name: string,
) {
  const mime = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ].find((t) => MediaRecorder.isTypeSupported(t));
  if (!mime)
    throw new Error("WebM recording is not supported by this browser.");
  const stream = canvas.captureStream(fps),
    recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 12000000,
    }),
    chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  recorder.onstop = () => {
    download(new Blob(chunks, { type: mime }), `${name}.webm`);
    stream.getTracks().forEach((t) => t.stop());
  };
  recorder.start();
  return () => {
    if (recorder.state !== "inactive") recorder.stop();
  };
}
