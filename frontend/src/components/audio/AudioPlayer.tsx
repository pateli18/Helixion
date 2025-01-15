import { BarHeight, SpeakerSegment } from "@/types";
import { MutableRefObject, useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { formatTime } from "@/utils/dateFormat";
import { calculatedBars, colorMap } from "./visualizationUtils";

export const AudioPlayer = (props: {
  audioUrl: string;
  audioRef: MutableRefObject<HTMLAudioElement | null>;
  speakerSegments: SpeakerSegment[];
  barHeights: BarHeight[];
  currentSegment: MutableRefObject<SpeakerSegment | null>;
  totalDuration: number;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const getCurrentSegment = (time: number) => {
    const sortedSegments = [...props.speakerSegments].sort(
      (a, b) => a.timestamp - b.timestamp
    );
    for (let i = sortedSegments.length - 1; i >= 0; i--) {
      if (time >= sortedSegments[i].timestamp) {
        props.currentSegment.current = sortedSegments[i];
        return;
      }
    }
    props.currentSegment.current = sortedSegments[0];
  };

  const handlePlayPause = () => {
    if (!props.audioRef.current) return;

    if (isPlaying) {
      props.audioRef.current.pause();
    } else {
      props.audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSkipBack = () => {
    if (!props.audioRef.current) return;
    props.audioRef.current.currentTime = Math.max(0, currentTime - 5);
  };

  const handleSkipForward = () => {
    if (!props.audioRef.current) return;
    props.audioRef.current.currentTime = Math.min(
      props.totalDuration,
      currentTime + 5
    );
  };

  useEffect(() => {
    if (!props.audioRef.current || !canvasRef.current) return;

    props.audioRef.current.addEventListener("play", () => setIsPlaying(true));
    props.audioRef.current.addEventListener("pause", () => setIsPlaying(false));

    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext("2d")!;

    const bars = calculatedBars({
      canvas,
      canvasCtx,
      barHeights: props.barHeights,
    });

    const handleTimeUpdate = () => {
      setCurrentTime(props.audioRef.current?.currentTime ?? 0);
    };
    props.audioRef.current.addEventListener("timeupdate", handleTimeUpdate);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      getCurrentSegment(props.audioRef.current?.currentTime ?? 0);

      // Clear the canvas before redrawing
      canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

      // Redraw all bars
      bars.forEach((bar) => {
        canvasCtx.fillStyle = bar.color;
        canvasCtx.fillRect(bar.x, bar.y, bar.width, bar.height);
      });

      // Draw playhead
      if (props.audioRef.current && props.audioRef.current.duration) {
        const playheadX =
          (props.audioRef.current.currentTime /
            props.audioRef.current.duration) *
          canvas.width;
        canvasCtx.beginPath();
        canvasCtx.moveTo(playheadX, 0);
        canvasCtx.lineTo(playheadX, canvas.height);
        canvasCtx.strokeStyle = colorMap["audio-bar"];
        canvasCtx.lineWidth = 10;
        canvasCtx.stroke();
      }
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      props.audioRef.current?.removeEventListener(
        "timeupdate",
        handleTimeUpdate
      );
    };
  }, []);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!props.audioRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickPosition = x / rect.width;

    props.audioRef.current.currentTime = clickPosition * props.totalDuration;
  };

  return (
    <div className="w-full mx-auto p-4 space-y-4">
      <canvas
        ref={canvasRef}
        className="w-full h-48 rounded-lg cursor-pointer"
        width={800}
        height={200}
        onClick={handleCanvasClick}
      />

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(props.totalDuration)}</span>
        </div>

        <div className="flex items-center justify-center space-x-2">
          <Button variant="default" size="icon" onClick={handleSkipBack}>
            <SkipBack className="h-4 w-4" />
          </Button>

          <Button variant="default" size="icon" onClick={handlePlayPause}>
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>

          <Button variant="default" size="icon" onClick={handleSkipForward}>
            <SkipForward className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <audio ref={props.audioRef} src={props.audioUrl} className="hidden" />
    </div>
  );
};
