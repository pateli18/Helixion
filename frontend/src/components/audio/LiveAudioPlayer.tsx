import { BarHeight, SpeakerSegment } from "@/types";
import { useEffect, useRef } from "react";
import { calculatedBars } from "./visualizationUtils";
import { Button } from "../ui/button";

export const LiveAudioPlayer = (props: {
  audioRef: React.RefObject<HTMLAudioElement>;
  audioUrl: string;
  speakerSegments?: React.MutableRefObject<SpeakerSegment[]>;
  handleHangUp: () => void;
  callEnded: boolean;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const sourceNode = useRef<MediaElementAudioSourceNode | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !props.audioRef.current) return;

    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext("2d")!;

    // Create Audio Context
    const context = new AudioContext();

    // Create Analyser Node
    const analyserNode = context.createAnalyser();
    analyserNode.fftSize = 2048;

    const audio = props.audioRef.current;
    sourceNode.current = context.createMediaElementSource(audio);
    sourceNode.current.connect(analyserNode);
    analyserNode.connect(context.destination);

    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const barCount = 32;

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);

      analyserNode.getByteFrequencyData(dataArray);
      const currentTime = props.audioRef.current?.currentTime ?? 0;

      const relevantSpeakerSegment = props.speakerSegments?.current?.findLast(
        (segment) => segment.timestamp <= currentTime
      );

      // Clear the canvas before redrawing
      canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

      // TODO: calculate bar heights
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
          speaker: relevantSpeakerSegment?.speaker ?? "User",
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

    draw();

    return () => {
      if (context.state !== "closed") {
        context.close();
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (sourceNode.current) {
        sourceNode.current.disconnect();
      }
    };
  }, []);

  return (
    <div className="w-full mx-auto p-4 space-y-4">
      <canvas
        ref={canvasRef}
        className="w-full h-48 rounded-lg cursor-pointer"
        width={800}
        height={200}
      />

      <div className="flex items-center justify-center space-x-2">
        {props.callEnded ? (
          <Button variant="secondary" size="sm" disabled>
            Call Ended
          </Button>
        ) : (
          <Button variant="destructive" size="sm" onClick={props.handleHangUp}>
            Hang Up
          </Button>
        )}
      </div>
      <audio
        autoPlay
        ref={props.audioRef}
        src={props.audioUrl}
        className="hidden"
      />
    </div>
  );
};
