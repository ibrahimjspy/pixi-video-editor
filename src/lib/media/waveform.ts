import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny';

/** Resolution of the stored envelope: one peak per 1/PEAKS_PER_SECOND seconds. */
export const PEAKS_PER_SECOND = 40;

export interface Waveform {
  /** Loudest absolute sample (0 to 1) in each 1/PEAKS_PER_SECOND slice. */
  peaks: Float32Array;
}

const cache = new Map<string, Promise<Waveform | null>>();

const compute = async (url: string): Promise<Waveform | null> => {
  const blob = await (await fetch(url)).blob();
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });

  try {
    const track = await input.getPrimaryAudioTrack();

    if (!track || !(await track.canDecode())) {
      return null;
    }

    const duration = await track.computeDuration();
    const peaks = new Float32Array(Math.max(1, Math.ceil(duration * PEAKS_PER_SECOND)));
    const sink = new AudioBufferSink(track);

    for await (const { buffer, timestamp } of sink.buffers()) {
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) =>
        buffer.getChannelData(index),
      );
      const rate = buffer.sampleRate;

      for (let i = 0; i < buffer.length; i += 1) {
        const bin = Math.floor((timestamp + i / rate) * PEAKS_PER_SECOND);

        if (bin < 0 || bin >= peaks.length) {
          continue;
        }

        for (const channel of channels) {
          const level = Math.abs(channel[i]);

          if (level > peaks[bin]) {
            peaks[bin] = level;
          }
        }
      }
    }

    return { peaks };
  } finally {
    input.dispose();
  }
};

/**
 * The loudness envelope of a video asset's audio, or null when the file has no
 * decodable audio. Computed once per asset and shared by every clip of it.
 */
export const getWaveform = (assetId: string, url: string): Promise<Waveform | null> => {
  let entry = cache.get(assetId);

  if (!entry) {
    entry = compute(url).catch((error) => {
      console.warn('Waveform could not be computed', error);
      return null;
    });
    cache.set(assetId, entry);
  }

  return entry;
};
