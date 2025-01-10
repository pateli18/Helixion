import { useEffect, useRef, useState } from "react";

const produceBars = (width: number, height: number, dataArray: Uint8Array) => {
  // Number of bars to display
  const barCount = 32;
  // Width of each bar
  const barWidth = (width - (barCount - 1) * 2) / barCount; // 2px gap between bars
  // Gap between bars
  const barGap = 2;
  // Start position (centered)
  const startX = 0; //(canvas.width - barCount * (barWidth + barGap)) / 2;

  // figure out the last value that is not 0
  const lastValueIndex = dataArray.findLastIndex((value) => value >= 1);
  const windowSize = Math.floor(lastValueIndex / barCount);

  // initialize bars
  const bars = [];

  // Sample the frequency data
  for (let i = 0; i < barCount; i++) {
    // Average several frequency bands together
    const value = Math.floor(
      dataArray
        .slice(i * windowSize, (i + 1) * windowSize)
        .reduce((a, b) => a + b, 0) / windowSize
    );

    // Calculate bar height (normalized)
    const barHeight = (value / 255.0) * (height * 0.8);

    // Calculate x position
    const x = startX + i * (barWidth + barGap);

    // Draw bar from center
    const y = (height - barHeight) / 2;

    bars.push({ x, y, width: barWidth, height: barHeight });
  }

  return bars;
};

const determineRelevantSpeaker = (
  currentTime: number,
  speakerIntervals?: { timestamp: number; speaker: "User" | "Assistant" }[]
) => {
  if (!speakerIntervals) return { relevantSpeaker: "User", speakerIntervals };
  if (speakerIntervals.length > 100) {
    const fiveMinutesAgo = currentTime - 300;
    speakerIntervals = speakerIntervals
      .filter((interval) => interval.timestamp > fiveMinutesAgo)
      .slice(-100);
  }

  const relevantSpeaker =
    speakerIntervals.findLast((interval) => interval.timestamp <= currentTime)
      ?.speaker ?? "User";

  return { relevantSpeaker, speakerIntervals };
};

export const AudioVisualizer = (props: {
  audioRef: React.RefObject<HTMLAudioElement>;
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  speakerIntervals?: React.MutableRefObject<
    { timestamp: number; speaker: "User" | "Assistant" }[]
  >;
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameId = useRef<number | null>(null);

  const draw = () => {
    if (!props.analyser || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const bufferLength = props.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const drawVisual = () => {
      if (!ctx) return;
      animationFrameId.current = requestAnimationFrame(drawVisual);

      props.analyser!.getByteFrequencyData(dataArray);
      const currentTime = props.audioRef.current?.currentTime ?? 0;

      // determine which speaker is speaking
      const { relevantSpeaker, speakerIntervals } = determineRelevantSpeaker(
        currentTime,
        props.speakerIntervals?.current
      );
      if (props.speakerIntervals && speakerIntervals) {
        props.speakerIntervals.current = speakerIntervals;
      }

      // clear and repaint the canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = relevantSpeaker === "User" ? `#3B82F6` : `#16A34A`;
      const bars = produceBars(canvas.width, canvas.height, dataArray);
      bars.forEach((bar) => {
        ctx.fillRect(bar.x, bar.y, bar.width, bar.height);
      });
    };

    drawVisual();
  };

  useEffect(() => {
    if (props.isPlaying) {
      draw();
    } else {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    }
  }, [props.isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-48 rounded"
      width={400}
      height={200}
    />
  );
};
