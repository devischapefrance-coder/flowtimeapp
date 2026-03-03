class AudioManager {
  private audio: HTMLAudioElement | null = null;
  private currentTrack: string | null = null;
  private _volume = 0.7;
  private listeners: Set<() => void> = new Set();

  play(src: string) {
    if (this.audio && this.currentTrack === src) {
      // Toggle pause/play
      if (this.audio.paused) {
        this.audio.play();
      } else {
        this.audio.pause();
      }
      this.notify();
      return;
    }

    this.stop();
    this.audio = new Audio(src);
    this.audio.loop = true;
    this.audio.volume = this._volume;
    this.currentTrack = src;
    this.audio.play().catch(() => {});
    this.audio.onended = () => this.notify();
    this.notify();
  }

  stop() {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = "";
      this.audio = null;
    }
    this.currentTrack = null;
    this.notify();
  }

  setVolume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.audio) this.audio.volume = this._volume;
    this.notify();
  }

  get volume() { return this._volume; }
  get playing() { return this.audio ? !this.audio.paused : false; }
  get track() { return this.currentTrack; }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }
}

export const audioManager = new AudioManager();
