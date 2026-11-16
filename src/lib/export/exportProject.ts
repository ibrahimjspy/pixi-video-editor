import * as PIXI from 'pixi.js';
import {
  ALL_FORMATS,
  AudioBufferSink,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSource,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  WebMOutputFormat,
} from 'mediabunny';
import { Project } from '@/types/editor';
import { getAssetById, getCurrentLayers, getCurrentScene } from '@/lib/editor/defaults';
import {
  getLayerVolume,
  getProjectLayerSpan,
  getTimelineDurationMs,
} from '@/lib/editor/timeline';
import { getPreviewHandle } from '@/lib/renderer/previewHandle';
import { usePlaybackStore } from '@/store/playbackStore';

export type ExportFormat = 'mp4' | 'webm';

export interface ExportOptions {
  format: ExportFormat;
  /** Output size as a multiple of the canvas: 1, 2 or 4. */
  scale: 1 | 2 | 4;
  fps: 24 | 30 | 60;
}

export interface ExportProgress {
  phase: 'audio' | 'video' | 'finishing';
  /** 0 to 1 across the whole export. */
  fraction: number;
  frame: number;
  totalFrames: number;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
  width: number;
  height: number;
  durationMs: number;
  frames: number;
  videoCodec: string;
  audioCodec: string | null;
}

export interface ExportRequest {
  project: Project;
  options: ExportOptions;
  onProgress?: (progress: ExportProgress) => void;
  signal?: AbortSignal;
}

/** Sample rate of the mixed soundtrack. */
const AUDIO_SAMPLE_RATE = 48_000;

/** Same as the preview's background, so exported frames match what is on screen. */
const BACKGROUND_COLOR = 0x0e1318;

const AUDIO_SHARE_OF_PROGRESS = 0.1;

const abortError = () => new DOMException('Export cancelled', 'AbortError');

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw abortError();
  }
};

/** Whether this browser can encode video at all (WebCodecs). */
export const isExportSupported = (): boolean =>
  typeof window !== 'undefined' &&
  typeof VideoEncoder !== 'undefined' &&
  typeof AudioEncoder !== 'undefined';

/** Seconds of project time as a safe file name. */
const toFileName = (name: string, extension: string) => {
  const base = name.trim().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'project';

  return `${base}.${extension}`;
};

/**
 * Renders every audible video layer, at its place on the timeline, into one
 * stereo buffer covering the whole project. Returns null when nothing is
 * audible, so the export carries no audio track at all.
 *
 * Audio is decoded straight from the stored files in streaming fashion, so
 * a long video does not have to fit in memory as one decoded blob.
 */
const mixAudio = async (
  project: Project,
  durationMs: number,
  signal?: AbortSignal,
): Promise<AudioBuffer | null> => {
  const layers = getCurrentLayers(project).flatMap((layer) =>
    layer.type === 'video' && layer.visible && !layer.muted && getLayerVolume(layer) > 0
      ? [layer]
      : [],
  );

  if (layers.length === 0) {
    return null;
  }

  const context = new OfflineAudioContext(
    2,
    Math.ceil((durationMs / 1000) * AUDIO_SAMPLE_RATE),
    AUDIO_SAMPLE_RATE,
  );
  let scheduled = 0;

  for (const layer of layers) {
    throwIfAborted(signal);

    const asset = getAssetById(project, layer.assetId);

    if (!asset) {
      continue;
    }

    const blob = await (await fetch(asset.url)).blob();
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });

    try {
      const track = await input.getPrimaryAudioTrack();

      if (!track || !(await track.canDecode())) {
        continue;
      }

      const span = getProjectLayerSpan(project, layer);
      const startSeconds = span.startMs / 1000;
      const lengthSeconds = (span.endMs - span.startMs) / 1000;
      const trimStartSeconds = layer.trimStartMs / 1000;
      const gain = context.createGain();

      gain.gain.value = getLayerVolume(layer);
      gain.connect(context.destination);

      const sink = new AudioBufferSink(track);

      for await (const { buffer, timestamp } of sink.buffers(
        trimStartSeconds,
        trimStartSeconds + lengthSeconds,
      )) {
        throwIfAborted(signal);

        // A decoded buffer may begin before the trim point; skip that part.
        let when = startSeconds + (timestamp - trimStartSeconds);
        let offset = 0;

        if (when < startSeconds) {
          offset = startSeconds - when;
          when = startSeconds;
        }

        const playable = Math.min(buffer.duration - offset, startSeconds + lengthSeconds - when);

        if (playable <= 0) {
          continue;
        }

        const node = context.createBufferSource();
        node.buffer = buffer;
        node.connect(gain);
        node.start(when, offset, playable);
        scheduled += 1;
      }
    } finally {
      input.dispose();
    }
  }

  return scheduled === 0 ? null : context.startRendering();
};

/** A one-second (or shorter) slice of a rendered buffer. */
const sliceAudio = (buffer: AudioBuffer, fromSeconds: number, toSeconds: number): AudioBuffer | null => {
  const start = Math.floor(fromSeconds * buffer.sampleRate);
  const end = Math.min(buffer.length, Math.floor(toSeconds * buffer.sampleRate));

  if (end <= start) {
    return null;
  }

  const slice = new AudioBuffer({
    length: end - start,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  });

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    slice.copyToChannel(buffer.getChannelData(channel).subarray(start, end), channel);
  }

  return slice;
};

/**
 * Renders the project to a video file, entirely in the browser.
 *
 * Every frame is rendered on its own: the preview's stage is put at an exact
 * instant, each visible video is seeked to the matching source frame and
 * awaited, and the result is drawn to a Pixi render texture at the output
 * size and handed to the encoder. Because nothing depends on real time, the
 * output is frame-accurate and as sharp as the chosen size, even when the
 * machine is slower or faster than playback.
 */
export const exportProject = async ({
  project,
  options,
  onProgress,
  signal,
}: ExportRequest): Promise<ExportResult> => {
  const handle = getPreviewHandle();

  if (!handle) {
    throw new Error('The preview is not ready yet.');
  }

  if (!isExportSupported()) {
    throw new Error(
      'This browser cannot encode video. Use a recent version of Chrome, Edge or Safari.',
    );
  }

  const { app, renderer } = handle;
  const scene = getCurrentScene(project);
  const width = scene.canvasWidth * options.scale;
  const height = scene.canvasHeight * options.scale;
  const durationMs = getTimelineDurationMs(project);
  const totalFrames = Math.max(1, Math.ceil((durationMs / 1000) * options.fps));
  const playback = usePlaybackStore.getState();
  const resumeAtMs = playback.currentMs;

  const format = options.format === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat();
  const videoCodec = await getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), {
    width,
    height,
    frameRate: options.fps,
  });

  if (!videoCodec) {
    throw new Error(
      `This browser cannot encode ${width}×${height} ${options.format.toUpperCase()} video. Try a smaller size or the other format.`,
    );
  }

  playback.setLocked(true);

  let output: Output | null = null;
  const renderTexture = PIXI.RenderTexture.create({
    width: scene.canvasWidth,
    height: scene.canvasHeight,
    resolution: options.scale,
  });

  try {
    onProgress?.({ phase: 'audio', fraction: 0, frame: 0, totalFrames });

    const mixed = await mixAudio(project, durationMs, signal);

    throwIfAborted(signal);

    const audioCodec = mixed
      ? await getFirstEncodableAudioCodec(format.getSupportedAudioCodecs(), {
          numberOfChannels: mixed.numberOfChannels,
          sampleRate: mixed.sampleRate,
        })
      : null;

    const target = new BufferTarget();
    output = new Output({ format, target });

    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = width;
    frameCanvas.height = height;
    const frameContext = frameCanvas.getContext('2d', { alpha: false });

    if (!frameContext) {
      throw new Error('A drawing surface for the export could not be created.');
    }

    const videoSource = new CanvasSource(frameCanvas, {
      codec: videoCodec,
      bitrate: QUALITY_HIGH,
    });

    output.addVideoTrack(videoSource, { frameRate: options.fps });

    let audioSource: AudioBufferSource | null = null;

    if (mixed && audioCodec) {
      audioSource = new AudioBufferSource({ codec: audioCodec, bitrate: QUALITY_HIGH });
      output.addAudioTrack(audioSource);
    }

    await output.start();
    renderer.beginExport();

    const frameSeconds = 1 / options.fps;
    let audioFedSeconds = 0;

    for (let frame = 0; frame < totalFrames; frame += 1) {
      throwIfAborted(signal);

      const timeSeconds = frame * frameSeconds;

      // Feed the soundtrack one second at a time so audio and video advance
      // together and the muxer never has to hold one far ahead of the other.
      if (audioSource && mixed && timeSeconds + 1 > audioFedSeconds) {
        const slice = sliceAudio(mixed, audioFedSeconds, audioFedSeconds + 1);

        if (slice) {
          await audioSource.add(slice);
        }

        audioFedSeconds += 1;
      }

      await renderer.renderFrameAt(timeSeconds * 1000);

      app.renderer.render({
        container: app.stage,
        target: renderTexture,
        clear: true,
        clearColor: BACKGROUND_COLOR,
      });

      const rendered = app.renderer.extract.canvas({ target: renderTexture });
      frameContext.drawImage(rendered as CanvasImageSource, 0, 0, width, height);

      await videoSource.add(timeSeconds, frameSeconds);

      onProgress?.({
        phase: 'video',
        fraction: AUDIO_SHARE_OF_PROGRESS + (1 - AUDIO_SHARE_OF_PROGRESS) * ((frame + 1) / totalFrames),
        frame: frame + 1,
        totalFrames,
      });
    }

    // Any audio past the last whole second still has to be written.
    if (audioSource && mixed && audioFedSeconds < mixed.duration) {
      const tail = sliceAudio(mixed, audioFedSeconds, mixed.duration);

      if (tail) {
        await audioSource.add(tail);
      }
    }

    onProgress?.({ phase: 'finishing', fraction: 0.99, frame: totalFrames, totalFrames });
    await output.finalize();

    if (!target.buffer) {
      throw new Error('The encoder produced no data.');
    }

    return {
      blob: new Blob([target.buffer], { type: format.mimeType }),
      filename: toFileName(project.name, format.fileExtension.replace(/^\./, '')),
      width,
      height,
      durationMs,
      frames: totalFrames,
      videoCodec,
      audioCodec,
    };
  } catch (error) {
    if (output && output.state !== 'finalized' && output.state !== 'canceled') {
      await output.cancel().catch(() => {});
    }

    throw error;
  } finally {
    renderTexture.destroy(true);
    renderer.endExport(resumeAtMs);
    usePlaybackStore.getState().setLocked(false);
    usePlaybackStore.getState().seek(resumeAtMs, { pause: true });
  }
};
