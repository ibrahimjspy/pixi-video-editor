import * as PIXI from 'pixi.js';

/** A video element being prepared for a layer, with a way to abandon it. */
export interface VideoLoad {
  video: HTMLVideoElement;
  /** Resolves with an unplaced sprite once the first frame is available. */
  ready: Promise<PIXI.Sprite>;
  /** Stops waiting and releases the element. Safe to call more than once. */
  cancel: () => void;
}

/**
 * Stops playback and detaches the media resource so the browser can free the
 * decoder. Destroying a sprite alone leaves the element playing.
 */
export const releaseVideoElement = (video: HTMLVideoElement) => {
  video.pause();
  video.removeAttribute('src');
  video.load();
};

/**
 * Starts loading a video asset and wraps it in a sprite once the first frame
 * has been decoded. Placement is left to the RendererManager.
 *
 * The element is created paused and silent: the renderer decides when it
 * plays, where it sits in the source, and whether it is audible, so that the
 * playhead stays the single source of truth for time.
 */
export const loadVideoSprite = (url: string): VideoLoad => {
  const video = document.createElement('video');
  // crossOrigin must be set before src for it to apply to the request.
  video.crossOrigin = 'anonymous';
  video.autoplay = false;
  video.loop = false;
  video.playsInline = true;
  video.preload = 'auto';
  video.muted = true;

  let detach = () => {};

  const ready = new Promise<PIXI.Sprite>((resolve, reject) => {
    const onLoaded = () => {
      detach();
      // autoPlay is off so Pixi never starts the element behind our back.
      const source = new PIXI.VideoSource({ resource: video, autoPlay: false });
      resolve(new PIXI.Sprite(new PIXI.Texture({ source })));
    };
    const onError = () => {
      detach();
      reject(new Error(`Video asset could not be loaded: ${url}`));
    };

    detach = () => {
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('error', onError);
    };

    video.addEventListener('loadeddata', onLoaded);
    video.addEventListener('error', onError);
  });

  video.src = url;

  return {
    video,
    ready,
    cancel: () => {
      detach();
      releaseVideoElement(video);
    },
  };
};

/** Positions closer than this, in seconds, count as already there. */
const SEEK_EPSILON_S = 0.002;

/** A seek that never reports back must not hang an export. */
const SEEK_TIMEOUT_MS = 4000;

/**
 * Drives one video element's position.
 *
 * Browsers drop or queue overlapping seeks unpredictably, which makes
 * scrubbing stutter. The driver keeps at most one seek in flight and, when the
 * playhead moves on in the meantime, jumps straight to the newest target.
 */
export class VideoDriver {
  readonly video: HTMLVideoElement;
  private target: number | null = null;
  private seeking = false;
  private waiters: Array<() => void> = [];
  private disposed = false;

  constructor(video: HTMLVideoElement) {
    this.video = video;
    video.addEventListener('seeked', this.handleSeeked);
    video.addEventListener('error', this.handleSeeked);
  }

  /** Whether a seek is running or queued. */
  get isBusy(): boolean {
    return this.seeking || this.target !== null;
  }

  /** Moves to `seconds` in the source file, coalescing with any seek in flight. */
  seek(seconds: number) {
    if (this.disposed) {
      return;
    }

    this.target = Math.max(0, seconds);

    if (!this.seeking) {
      this.pump();
    }
  }

  /** Resolves once no seek is running or queued. */
  settled(): Promise<void> {
    if (!this.isBusy || this.disposed) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const timer = setTimeout(done, SEEK_TIMEOUT_MS);

      function done() {
        clearTimeout(timer);
        resolve();
      }

      this.waiters.push(done);
    });
  }

  /** Seeks and waits until the frame at that position is ready. */
  async seekExact(seconds: number): Promise<void> {
    this.seek(seconds);
    await this.settled();
  }

  dispose() {
    this.disposed = true;
    this.target = null;
    this.seeking = false;
    this.video.removeEventListener('seeked', this.handleSeeked);
    this.video.removeEventListener('error', this.handleSeeked);
    this.flush();
  }

  private handleSeeked = () => {
    this.seeking = false;
    this.pump();
  };

  private pump() {
    if (this.target !== null) {
      const next = this.target;
      this.target = null;

      if (Math.abs(this.video.currentTime - next) > SEEK_EPSILON_S) {
        this.seeking = true;
        this.video.currentTime = next;
        return;
      }
    }

    if (!this.seeking) {
      this.flush();
    }
  }

  private flush() {
    const waiters = this.waiters;
    this.waiters = [];
    waiters.forEach((resolve) => resolve());
  }
}
