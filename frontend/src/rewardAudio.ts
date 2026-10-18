import bell from "./assets/success-bell.wav?inline";
import { readRewardPreference } from "./rewardPreferences";

/** The WAV is embedded in the bundle; playback never needs a network request. */
export class RewardAudio {
  private context?: AudioContext;
  private buffer?: Promise<AudioBuffer>;
  private source?: AudioBufferSourceNode;

  prepare() {
    try {
      this.context ??= new AudioContext();
      const context = this.context;
      // Called synchronously from the submit gesture, before awaiting the API.
      void context.resume().catch(() => undefined);
      this.buffer ??= context.decodeAudioData(Uint8Array.from(atob(bell.split(",")[1]), char => char.charCodeAt(0)).buffer);
      void this.buffer.catch(() => undefined);
    } catch { /* Unsupported or blocked audio must never interrupt training. */ }
  }

  async play() {
    try {
      const buffer = await this.buffer;
      if (!buffer || this.context?.state !== "running" || !readRewardPreference("sounds") || document.hidden) return;
      this.stop();
      this.source = this.context.createBufferSource();
      this.source.buffer = buffer;
      this.source.connect(this.context.destination);
      this.source.start();
    } catch { /* Safe silent fallback. */ }
  }

  stop() { this.source?.stop(); this.source = undefined; }
  dispose() { this.stop(); void this.context?.close().catch(() => undefined); }
}
