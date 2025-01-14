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
