import type { Asset, AssetType } from "../project/types";
const extensions: Record<string, AssetType> = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  svg: "image",
  gif: "image",
  mp4: "video",
  webm: "video",
  mov: "video",
  wav: "audio",
  mp3: "audio",
  ogg: "audio",
  glsl: "shader",
  frag: "shader",
  ttf: "font",
  otf: "font",
  woff: "font",
  woff2: "font",
};
export function resolveAsset(assets: Asset[], name: string): Asset | undefined {
  return (
    assets.find((a) => a.id === name || a.name === name) ||
    assets.find((a) => a.aliases.includes(name))
  );
}
export function uniqueName(name: string, assets: Asset[]): string {
  let result = name,
    i = 2;
  while (assets.some((a) => a.name === result || a.aliases.includes(result))) {
    const dot = name.lastIndexOf(".");
    result =
      dot > 0
        ? `${name.slice(0, dot)} ${i++}${name.slice(dot)}`
        : `${name} ${i++}`;
  }
  return result;
}
export async function importAsset(file: File, assets: Asset[]): Promise<Asset> {
  const type = extensions[file.name.split(".").pop()!.toLowerCase()];
  if (!type) throw new Error(`Unsupported file: ${file.name}`);
  const data =
    type === "shader"
      ? await file.text()
      : await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error(`Cannot read ${file.name}`));
          reader.readAsDataURL(file);
        });
  return {
    id: crypto.randomUUID(),
    name: uniqueName(file.name, assets),
    aliases: [],
    type,
    originalName: file.name,
    mimeType: file.type,
    data,
    metadata: { size: file.size },
  };
}
export function assetCode(asset: Asset): string {
  const name = JSON.stringify(asset.name);
  switch (asset.type) {
    case "shader":
      return `shader(${name});`;
    case "font":
      return `text("Hello", ${name}, 0, 0, 0, 1, 0, 5, "#ffffff");`;
    case "audio":
      return `audio(${name});`;
    default:
      return `draw(${name}, 0, 0, 0, 1, 0, 5, "#ffffff");`;
  }
}
