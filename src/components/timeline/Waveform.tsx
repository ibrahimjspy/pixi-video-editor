'use client';

import { useEffect, useRef, useState } from 'react';
import { getWaveform, PEAKS_PER_SECOND, Waveform as WaveformData } from '@/lib/media/waveform';

interface WaveformProps {
  assetId: string;
  url: string;
  /** The part of the source file the clip plays, in milliseconds. */
  fromMs: number;
  toMs: number;
  /** Display width in CSS pixels, used to decide how many bars to draw. */
  width: number;
  height: number;
  muted: boolean;
}

/** Widest backing store, in device pixels, so a huge zoom cannot allocate a huge canvas. */
const MAX_CANVAS_WIDTH = 4096;

/** Draws the loudness envelope of the played part of a video's audio. */
const Waveform = ({ assetId, url, fromMs, toMs, width, height, muted }: WaveformProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<WaveformData | null>(null);

  useEffect(() => {
    let isActive = true;

    void getWaveform(assetId, url).then((result) => {
      if (isActive) {
        setData(result);
      }
    });

    return () => {
      isActive = false;
    };
  }, [assetId, url]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas || !data || width < 2) {
      return;
    }

    const scale = Math.min(window.devicePixelRatio || 1, MAX_CANVAS_WIDTH / width);
    const pixelWidth = Math.max(1, Math.floor(width * scale));
    const pixelHeight = Math.max(1, Math.floor(height * scale));

    canvas.width = pixelWidth;
    canvas.height = pixelHeight;

    const context = canvas.getContext('2d');

    if (!context) {
      return;
    }

    context.clearRect(0, 0, pixelWidth, pixelHeight);
    context.fillStyle = muted ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.55)';

    const firstPeak = (fromMs / 1000) * PEAKS_PER_SECOND;
    const peakSpan = ((toMs - fromMs) / 1000) * PEAKS_PER_SECOND;
    const middle = pixelHeight / 2;

    for (let x = 0; x < pixelWidth; x += 1) {
      const start = Math.floor(firstPeak + (x / pixelWidth) * peakSpan);
      const end = Math.max(start + 1, Math.floor(firstPeak + ((x + 1) / pixelWidth) * peakSpan));
      let level = 0;

      for (let index = start; index < end && index < data.peaks.length; index += 1) {
        level = Math.max(level, data.peaks[index]);
      }

      // A gentle curve keeps quiet speech visible without clipping loud peaks.
      const barHeight = Math.max(1, Math.sqrt(level) * pixelHeight * 0.9);
      context.fillRect(x, middle - barHeight / 2, 1, barHeight);
    }
  }, [data, fromMs, toMs, width, height, muted]);

  if (data === null) {
    return null;
  }

  return <canvas ref={canvasRef} className="signal-clip__wave" aria-hidden="true" />;
};

export default Waveform;
