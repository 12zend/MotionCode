import { useRef, useState } from "react";
import {
  FileImage,
  Film,
  Music2,
  Type,
  Braces,
  Plus,
  Search,
  Copy,
  Trash2,
  Pencil,
  Code2,
  FileCode2,
} from "lucide-react";
import { useStore } from "../project/store";
import { importAsset, uniqueName } from "../assets/assets";
import { compile, renameReferences } from "../compiler";
import type { Asset } from "../project/types";
const icons = {
  image: FileImage,
  video: Film,
  audio: Music2,
  font: Type,
  shader: Braces,
};
export function MediaLibrary({
  onShader,
  onInsert,
  onMain,
}: {
  onShader: (id: string) => void;
  onInsert: (a: Asset) => void;
  onMain: () => void;
}) {
  const project = useStore((s) => s.project),
    selected = useStore((s) => s.selectedAsset);
  const [query, setQuery] = useState(""),
    [sort, setSort] = useState("type"),
    [renaming, setRenaming] = useState<string | null>(null),
    [name, setName] = useState(""),
    [drag, setDrag] = useState(false),
    [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const selectedAsset = project.assets.find((a) => a.id === selected);
  const add = async (files: FileList | null) => {
    if (!files) return;
    setError("");
    for (const file of Array.from(files)) {
      try {
        const a = await importAsset(file, useStore.getState().project.assets);
        useStore.getState().edit((p) => ({ ...p, assets: [...p.assets, a] }));
        useStore.getState().set({ selectedAsset: a.id });
      } catch (e) {
        setError(String(e));
      }
    }
  };
  const rename = (asset: Asset) => {
    const trimmed = name.trim();
    if (!trimmed) {
      setRenaming(null);
      return;
    }
    const next = uniqueName(
      trimmed,
      project.assets.filter((a) => a.id !== asset.id),
    );
    useStore.getState().edit((p) => ({
      ...p,
      code: renameReferences(p.code, p.assets, asset.id, next),
      assets: p.assets.map((a) =>
        a.id === asset.id
          ? {
              ...a,
              name: next,
              aliases: [...new Set([...a.aliases, a.name])],
            }
          : a,
      ),
    }));
    setRenaming(null);
  };
  const remove = (asset: Asset) => {
    const count =
      compile(project.code, project.assets).ir?.sites.filter(
        (s) => s.assetId === asset.id,
      ).length ?? 0;
    if (
      count &&
      !window.confirm(
        `「${asset.name}」はコード内で${count}箇所使用されています。削除すると参照エラーになります。削除しますか？`,
      )
    )
      return;
    useStore.getState().edit((p) => ({
      ...p,
      assets: p.assets.filter((a) => a.id !== asset.id),
    }));
    useStore.getState().set({ selectedAsset: null });
  };
  const assets = project.assets
    .filter((a) => a.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : a.type.localeCompare(b.type) || a.name.localeCompare(b.name),
    );
  return (
    <aside
      className={`media-panel ${drag ? "drop-active" : ""}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDrag(true);
        }
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        if (e.dataTransfer.files.length) {
          e.preventDefault();
          setDrag(false);
          void add(e.dataTransfer.files);
        }
      }}
    >
      <div className="panel-heading">
        <span>Media</span>
        <button
          className="icon-button"
          title="Import media"
          aria-label="Import media"
          onClick={() => input.current?.click()}
        >
          <Plus size={16} />
        </button>
      </div>
      <input
        ref={input}
        data-testid="media-input"
        type="file"
        multiple
        hidden
        accept=".png,.jpg,.jpeg,.webp,.svg,.gif,.mp4,.webm,.mov,.wav,.mp3,.ogg,.glsl,.frag,.ttf,.otf,.woff,.woff2"
        onChange={(e) => {
          void add(e.target.files);
          e.target.value = "";
        }}
      />
      <button className="project-file" onClick={onMain}>
        <FileCode2 size={16} />
        <span>main.motion</span>
      </button>

      <label className="search-field">
        <Search size={14} />
        <input
          aria-label="Search media"
          placeholder="Find an asset…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="asset-tools">
        <span>{project.assets.length} assets</span>
        <select
          aria-label="Sort assets"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="type">By type</option>
          <option value="name">A–Z</option>
        </select>
      </div>
      <div className="asset-list">
        {assets.map((a) => {
          const Icon = icons[a.type];
          return (
            <div
              key={a.id}
              className={`asset-row ${selected === a.id ? "selected" : ""}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/motion-asset", a.id);
                e.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => useStore.getState().set({ selectedAsset: a.id })}
              onDoubleClick={() =>
                a.type === "shader" ? onShader(a.id) : onInsert(a)
              }
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  useStore.getState().set({ selectedAsset: a.id });
                  if (a.type === "shader") onShader(a.id);
                }
              }}
            >
              <Icon size={16} className={`asset-icon ${a.type}`} />
              {renaming === a.id ? (
                <input
                  autoFocus
                  aria-label="Asset name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => rename(a)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") rename(a);
                    if (e.key === "Escape") setRenaming(null);
                  }}
                />
              ) : (
                <span
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/motion-asset", a.id);
                    e.dataTransfer.setData(
                      "application/motion-reference",
                      "true",
                    );
                    e.stopPropagation();
                  }}
                >
                  {a.name}
                </span>
              )}
            </div>
          );
        })}
        {!assets.length && <p className="empty">No matching assets.</p>}
      </div>
      <button className="import-area" onClick={() => input.current?.click()}>
        <Plus size={18} />
        <span>Drop media here</span>
      </button>
      {error && <p className="error-message">{error}</p>}
      {selectedAsset && (
        <div className="asset-detail">
          <div className="detail-heading">
            <span>{selectedAsset.type} asset</span>
            <div>
              <button
                className="icon-button"
                aria-label="Rename asset"
                title="Rename"
                onClick={() => {
                  setRenaming(selectedAsset.id);
                  setName(selectedAsset.name);
                }}
              >
                <Pencil size={13} />
              </button>
              <button
                className="icon-button"
                aria-label="Duplicate asset"
                title="Duplicate"
                onClick={() =>
                  useStore.getState().edit((p) => ({
                    ...p,
                    assets: [
                      ...p.assets,
                      {
                        ...selectedAsset,
                        id: crypto.randomUUID(),
                        name: uniqueName(selectedAsset.name, p.assets),
                        aliases: [],
                      },
                    ],
                  }))
                }
              >
                <Copy size={13} />
              </button>
              <button
                className="icon-button"
                aria-label="Delete asset"
                title="Delete"
                onClick={() => remove(selectedAsset)}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
          {selectedAsset.type === "image" && (
            <img src={selectedAsset.data} alt={selectedAsset.name} />
          )}
          {selectedAsset.type === "video" && (
            <video src={selectedAsset.data} controls />
          )}
          {selectedAsset.type === "audio" && (
            <audio src={selectedAsset.data} controls />
          )}
          {selectedAsset.type === "font" && (
            <div className="font-preview">
              Aa <span>あいう</span>
            </div>
          )}

          <button
            className="subtle-button"
            onClick={() => onInsert(selectedAsset)}
          >
            <Code2 size={13} /> Insert into code
          </button>
          <div className="usage-links">
            {compile(project.code, project.assets)
              .ir?.sites.filter((s) => s.assetId === selectedAsset.id)
              .map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    onMain();
                    useStore.getState().set({ selectedLine: s.line });
                  }}
                >
                  main.motion:{s.line}
                </button>
              ))}
          </div>
        </div>
      )}
    </aside>
  );
}
