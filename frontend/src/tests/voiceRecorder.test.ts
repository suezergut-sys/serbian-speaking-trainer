import { afterEach, describe, expect, it, vi } from "vitest";

import { supportsVoiceRecording, VoiceRecorder } from "../voiceRecorder";

const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");

class FakeMediaRecorder extends EventTarget {
  static isTypeSupported(type: string) {
    return type.startsWith("audio/webm");
  }

  state: RecordingState = "inactive";
  readonly mimeType: string;

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    super();
    this.mimeType = options?.mimeType ?? "audio/webm";
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    const dataEvent = new Event("dataavailable") as Event & { data: Blob };
    Object.defineProperty(dataEvent, "data", { value: new Blob(["recorded-audio"], { type: this.mimeType }) });
    this.dispatchEvent(dataEvent);
    this.dispatchEvent(new Event("stop"));
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (originalMediaDevices) Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
  else delete (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
});

describe("VoiceRecorder", () => {
  it("records in memory, stops every track, and returns privacy-safe timing", async () => {
    const stopTrack = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop: stopTrack }],
        } as unknown as MediaStream)),
      },
    });
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    vi.spyOn(performance, "now").mockReturnValueOnce(1_000).mockReturnValueOnce(2_500);

    expect(supportsVoiceRecording()).toBe(true);
    const recorder = new VoiceRecorder();
    await recorder.start();
    const recording = await recorder.finish();

    expect(stopTrack).toHaveBeenCalledOnce();
    expect(recording.audio.type).toBe("audio/webm;codecs=opus");
    expect(recording.audio.size).toBeGreaterThan(0);
    expect(recording.timing).toMatchObject({
      reaction_ms: null,
      speech_duration_ms: 1_500,
      timings: { source: "media_recorder", audio_stored: false },
    });
  });

  it("stops a microphone stream that resolves after cancellation", async () => {
    let resolveStream!: (stream: MediaStream) => void;
    const stopTrack = vi.fn();
    const pendingStream = new Promise<MediaStream>((resolve) => { resolveStream = resolve; });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn(() => pendingStream) },
    });
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    const recorder = new VoiceRecorder();

    const started = recorder.start();
    recorder.stop();
    resolveStream({ getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream);
    await started;

    expect(stopTrack).toHaveBeenCalledOnce();
  });
});
