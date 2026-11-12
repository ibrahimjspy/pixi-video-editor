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
 */
export const loadVideoSprite = (url: string): VideoLoad => {
  const video = document.createElement('video');
  // crossOrigin must be set before src for it to apply to the request.
  video.crossOrigin = 'anonymous';
  video.autoplay = true;
  video.loop = true;
  video.playsInline = true;
  // TODO: reflect `layer.muted`. Browsers block autoplay with sound until a
  // user gesture, so playback stays muted until audio is wired up properly.
  video.muted = true;

  let detach = () => {};

  const ready = new Promise<PIXI.Sprite>((resolve, reject) => {
    const onLoaded = () => {
      detach();
      resolve(new PIXI.Sprite(PIXI.Texture.from(video)));
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
