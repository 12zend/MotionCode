import { describe, it, expect, vi } from "vitest";
import {
  ProjectFileWriter,
  type MotionFileHandle,
} from "../src/project/fileAccess";
import { defaultProject } from "../src/project/defaults";
function fakeFile(name = "first.motion") {
  let content = "";
  const write = vi.fn(async (value: string) => {
    content = value;
  });
  const close = vi.fn(async () => {});
  const abort = vi.fn(async () => {});
  const handle: MotionFileHandle = {
    name,
    createWritable: vi.fn(async () => ({ write, close, abort })),
  };
  return { handle, write, close, abort, content: () => content };
}
describe("Overwrite project saves", () => {
  it("chooses once, then replaces the same file with the latest project", async () => {
    const file = fakeFile(),
      picker = vi.fn(async () => file.handle),
      remember = vi.fn(async () => {});
    const writer = new ProjectFileWriter(picker, remember);
    const p = defaultProject();
    await writer.save(p);
    await writer.save({ ...p, code: 'text("Updated");' });
    expect(picker).toHaveBeenCalledTimes(1);
    expect(file.close).toHaveBeenCalledTimes(2);
    expect(JSON.parse(file.content()).code).toBe('text("Updated");');
    expect(remember).toHaveBeenCalledWith(p.id, file.handle);
  });
  it("Save As switches subsequent saves to the newly chosen file", async () => {
    const first = fakeFile(),
      second = fakeFile("second.motion");
    const picker = vi
      .fn()
      .mockResolvedValueOnce(first.handle)
      .mockResolvedValueOnce(second.handle);
    const writer = new ProjectFileWriter(picker),
      p = defaultProject();
    await writer.save(p);
    await writer.save(p, true);
    await writer.save({ ...p, code: 'text("New");' });
    expect(picker).toHaveBeenCalledTimes(2);
    expect(first.write).toHaveBeenCalledTimes(1);
    expect(second.write).toHaveBeenCalledTimes(2);
  });
  it("canceling Save As retains the previous target", async () => {
    const file = fakeFile(),
      picker = vi
        .fn()
        .mockResolvedValueOnce(file.handle)
        .mockRejectedValueOnce(new DOMException("Canceled", "AbortError"));
    const writer = new ProjectFileWriter(picker),
      p = defaultProject();
    await writer.save(p);
    await expect(writer.save(p, true)).rejects.toThrow("Canceled");
    await writer.save(p);
    expect(file.write).toHaveBeenCalledTimes(2);
    expect(picker).toHaveBeenCalledTimes(2);
  });
  it("does not overwrite the previous project's file", async () => {
    const file = fakeFile(),
      picker = vi.fn(async () => file.handle),
      writer = new ProjectFileWriter(picker);
    await writer.save(defaultProject());
    await writer.save(defaultProject());
    expect(picker).toHaveBeenCalledTimes(2);
  });
  it("restores the chosen handle without opening a new picker", async () => {
    const file = fakeFile(),
      picker = vi.fn(async () => file.handle),
      writer = new ProjectFileWriter(picker),
      p = defaultProject();
    writer.setTarget(p.id, file.handle);
    await writer.save(p);
    expect(picker).not.toHaveBeenCalled();
    expect(file.write).toHaveBeenCalledOnce();
  });
  it("aborts a failed write without reporting a committed save", async () => {
    const file = fakeFile();
    file.write.mockRejectedValueOnce(new Error("Disk full"));
    const writer = new ProjectFileWriter(async () => file.handle);
    await expect(writer.save(defaultProject())).rejects.toThrow("Disk full");
    expect(file.close).not.toHaveBeenCalled();
    expect(file.abort).toHaveBeenCalledOnce();
    expect(writer.targetName).toBeNull();
  });
  it("falls back explicitly when the File System Access API is unavailable", async () => {
    const fallback = vi.fn(),
      writer = new ProjectFileWriter(undefined, undefined, fallback);
    const result = await writer.save(defaultProject());
    expect(result.mode).toBe("download");
    expect(fallback).toHaveBeenCalledOnce();
  });
});

it("serializes rapid repeated saves and commits the newest content last", async () => {
  let active = 0,
    maximum = 0,
    content = "";
  const handle: MotionFileHandle = {
    name: "queued.motion",
    async createWritable() {
      active++;
      maximum = Math.max(maximum, active);
      return {
        async write(value) {
          await new Promise((resolve) => setTimeout(resolve, 5));
          content = value;
        },
        async close() {
          active--;
        },
      };
    },
  };
  const picker = vi.fn(async () => handle),
    writer = new ProjectFileWriter(picker),
    project = defaultProject();
  await Promise.all(
    [1, 2, 3].map((n) => writer.save({ ...project, code: String(n) })),
  );
  expect(maximum).toBe(1);
  expect(JSON.parse(content).code).toBe("3");
  expect(picker).toHaveBeenCalledTimes(1);
});
