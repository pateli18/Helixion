import { BarHeight } from "@/types";

export const colorMap: Record<string, string> = {
  "User-speaker": "#193E32",
  "Assistant-speaker": "#DDEA68",
  "audio-bar": "hsl(222.2 47.4% 11.2%)",
};

export const calculatedBars = (props: {
  canvas: HTMLCanvasElement;
  canvasCtx: CanvasRenderingContext2D;
  barHeights: BarHeight[];
}) => {
  const barCount = props.barHeights.length;
  const barWidth = (props.canvas.width - (barCount - 1) * 2) / barCount; // 2px gap between bars
  const barGap = 2;

  const bars = props.barHeights.map((barHeight, i) => {
    const actualHeight = barHeight.height * props.canvas.height;
    const y = (props.canvas.height - actualHeight) / 2;
    const x = i * (barWidth + barGap);
    return {
      color: colorMap[`${barHeight.speaker}-speaker`],
      x,
      y,
      width: barWidth,
      height: actualHeight,
    };
  });
  return bars;
};

export const canvasDraw = (
  canvas: HTMLCanvasElement,
  canvasCtx: CanvasRenderingContext2D,
  dataArray: Uint8Array,
  speaker: "User" | "Assistant"
) => {
  // Clear the canvas before redrawing
  canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

  const barCount = 32;
  const barHeights: BarHeight[] = [];

  const lastValueIndex = dataArray.findLastIndex((value) => value >= 1);
  const windowSize = Math.floor(lastValueIndex / barCount);

  for (let i = 0; i < barCount; i++) {
    // Average several frequency bands together
    const value = Math.floor(
      dataArray
        .slice(i * windowSize, (i + 1) * windowSize)
        .reduce((a, b) => a + b, 0) / windowSize
    );

    // Calculate bar height (normalized)
    const barHeight = value / 255.0;

    barHeights.push({
      height: barHeight,
      speaker,
    });
  }

  const bars = calculatedBars({
    canvas,
    canvasCtx,
    barHeights,
  });

  // Redraw all bars
  bars.forEach((bar) => {
    canvasCtx.fillStyle = bar.color;
    canvasCtx.fillRect(bar.x, bar.y, bar.width, bar.height);
  });
};
