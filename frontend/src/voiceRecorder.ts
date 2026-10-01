import type { AttemptTimings } from "./types/training";

export type VoiceRecording = {
  audio: Blob;
  timing: AttemptTimings;
};

export function supportsVoiceRecording(): boolean {
  return typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

export class VoiceRecorder {
  private stream?: MediaStream;
  private recorder?: MediaRecorder;
  private chunks: Blob[] = [];
  private startedAt?: number;
  private stopped = false;
  private discard = false;

  async start(): Promise<void> {
    if (!supportsVoiceRecording()) throw new Error("Voice recording is not supported in this browser");

    const pendingStream = navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    pendingStream.then((stream) => {
      if (this.stopped) stream.getTracks().forEach((track) => track.stop());
    }).catch(() => undefined);

    try {
      this.stream = await withTimeout(pendingStream, 30_000, "Microphone selection timed out");
      if (this.stopped) return;

      const mimeType = preferredMimeType();
      const recorder = new MediaRecorder(this.stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 64_000,
      });
      this.recorder = recorder;
      recorder.addEventListener("dataavailable", (event) => {
        if (!this.discard && event.data.size > 0) this.chunks.push(event.data);
      });
      recorder.start(500);
      this.startedAt = performance.now();
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  async finish(): Promise<VoiceRecording> {
    const recorder = this.recorder;
    if (this.stopped || !recorder || recorder.state === "inactive") {
      throw new Error("Voice recording is not active");
    }

    const onStop = () => resolveFinished();
    const onError = () => rejectFinished(new Error("Voice recording failed"));
    let resolveFinished!: () => void;
    let rejectFinished!: (error: Error) => void;
    const finished = new Promise<void>((resolve, reject) => { resolveFinished = resolve; rejectFinished = reject; });
    recorder.addEventListener("stop", onStop);
    recorder.addEventListener("error", onError);
    try {
      recorder.stop();
      this.stopTracks();
      await withTimeout(finished, 30_000, "Microphone stop timed out");
    } catch (error) {
      this.stop();
      throw error;
    } finally {
      recorder.removeEventListener("stop", onStop);
      recorder.removeEventListener("error", onError);
    }
    this.stopped = true;

    const contentType = recorder.mimeType || this.chunks[0]?.type || "audio/webm";
    const audio = new Blob(this.chunks, { type: contentType });
    const durationMs = Math.max(0, Math.round(performance.now() - (this.startedAt ?? performance.now())));
    this.chunks = [];
    return {
      audio,
      timing: {
        reaction_ms: null,
        speech_duration_ms: durationMs,
        longest_pause_ms: null,
        pause_count: null,
        timings: { source: "media_recorder", audio_stored: false },
      },
    };
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.discard = true;
    try {
      if (this.recorder?.state !== "inactive") this.recorder?.stop();
    } catch { /* The stream and buffered chunks must still be released. */ }
    this.stopTracks();
    this.chunks = [];
  }

  private stopTracks(): void {
    const stream = this.stream;
    this.stream = undefined;
    stream?.getTracks().forEach((track) => track.stop());
  }
}

function preferredMimeType(): string | undefined {
  for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return undefined;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}
