import type { Asset } from "../project/types";
/** MediaElement sources keep transport and FFT analysis on the same audio clock. */
export class AudioEngine {
  private context?: AudioContext;
  private analyser?: AnalyserNode;
  private tracks = new Map<
    string,
    {
      element: HTMLAudioElement;
      source: MediaElementAudioSourceNode;
      gain: GainNode;
      data: string;
    }
  >();
  async resume() {
    this.context ??= new AudioContext();
    this.analyser ??= this.context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.connect(this.context.destination);
    await this.context.resume();
  }
  sync(
    requests: { assetId: string; volume: number; start: number }[],
    assets: Asset[],
    time: number,
    playing: boolean,
  ) {
    if (!this.context || !this.analyser) return;
    const active = new Set<string>();
    for (const r of requests) {
      const a = assets.find((a) => a.id === r.assetId);
      if (!a) continue;
      active.add(a.id);
      let track = this.tracks.get(a.id);
      if (track?.data !== a.data) {
        track?.element.pause();
        track?.source.disconnect();
        track?.gain.disconnect();
        const element = new Audio(a.data);
        const source = this.context.createMediaElementSource(element),
          gain = this.context.createGain();
        source.connect(gain).connect(this.analyser);
        track = { element, source, gain, data: a.data };
        this.tracks.set(a.id, track);
      }
      track.gain.gain.value = Math.max(0, Math.min(2, r.volume));
      const target = Math.max(0, time - r.start);
      if (Math.abs(track.element.currentTime - target) > 0.15)
        track.element.currentTime = target;
      if (playing && time >= r.start) void track.element.play().catch(() => {});
      else track.element.pause();
    }
    for (const [id, t] of this.tracks) if (!active.has(id)) t.element.pause();
  }
  levels() {
    if (!this.analyser || !this.context)
      return { level: 0, bass: 0, mid: 0, high: 0 };
    const bytes = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(bytes);
    const avg = (lo: number, hi: number) => {
      const start = Math.floor(
          (lo / (this.context!.sampleRate / 2)) * bytes.length,
        ),
        end = Math.min(
          bytes.length,
          Math.ceil((hi / (this.context!.sampleRate / 2)) * bytes.length),
        );
      let total = 0;
      for (let i = start; i < end; i++) total += bytes[i] / 255;
      return total / Math.max(1, end - start);
    };
    return {
      level: avg(20, 16000),
      bass: avg(20, 250),
      mid: avg(250, 4000),
      high: avg(4000, 16000),
    };
  }
  dispose() {
    for (const t of this.tracks.values()) {
      t.element.pause();
      t.source.disconnect();
      t.gain.disconnect();
    }
    void this.context?.close();
  }
}
