import { SpeakerSegment } from "@/types";
import { MutableRefObject, useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { formatTime } from "@/utils/dateFormat";

const speakerColors = {
  User: "#3B82F6",
  Assistant: "#16A34A",
};

export const AudioPlayer = (props: {
  audioUrl: string;
  audioRef: MutableRefObject<HTMLAudioElement | null>;
  speakerSegments: SpeakerSegment[];
  currentSegment: MutableRefObject<SpeakerSegment | null>;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number>();
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
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
    props.audioRef.current.currentTime = Math.min(duration, currentTime + 5);
  };

  useEffect(() => {
    if (!props.audioRef.current || !canvasRef.current) return;

    const audio = props.audioRef.current;

    const handleDurationChange = () => {
      setDuration(audio.duration);
    };

    audio.addEventListener("loadedmetadata", handleDurationChange);
    audio.addEventListener("play", () => setIsPlaying(true));
    audio.addEventListener("pause", () => setIsPlaying(false));

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyserRef.current = analyser;

    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const source = audioContext.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(audioContext.destination);

    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext("2d")!;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };
    audio.addEventListener("timeupdate", handleTimeUpdate);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);

      analyser.getByteFrequencyData(dataArray);

      canvasCtx.fillStyle = "rgb(20, 20, 20)";
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;

      getCurrentSegment(currentTime);

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;

        const barX = x;
        const barY = canvas.height - barHeight;
        const radius = (barWidth - 1) / 2;

        canvasCtx.beginPath();
        canvasCtx.moveTo(barX + radius, barY);
        canvasCtx.arcTo(
          barX + barWidth - 1,
          barY,
          barX + barWidth - 1,
          barY + barHeight,
          radius
        );
        canvasCtx.arcTo(
          barX + barWidth - 1,
          barY + barHeight,
          barX,
          barY + barHeight,
          radius
        );
        canvasCtx.arcTo(barX, barY + barHeight, barX, barY, radius);
        canvasCtx.arcTo(barX, barY, barX + barWidth - 1, barY, radius);
        canvasCtx.closePath();

        canvasCtx.fillStyle =
          speakerColors[props.currentSegment.current?.speaker ?? "User"];
        canvasCtx.fill();

        x += barWidth;
      }

      if (audio && audio.duration) {
        const playheadX = (currentTime / audio.duration) * canvas.width;
        canvasCtx.beginPath();
        canvasCtx.moveTo(playheadX, 0);
        canvasCtx.lineTo(playheadX, canvas.height);
        canvasCtx.strokeStyle = "rgb(239, 68, 68)";
        canvasCtx.lineWidth = 2;
        canvasCtx.stroke();
      }
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleDurationChange);
      audioContext.close();
    };
  }, []);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!props.audioRef.current || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickPosition = x / rect.width;

    props.audioRef.current.currentTime = clickPosition * duration;
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4 space-y-4">
      <canvas
        ref={canvasRef}
        className="w-full h-48 bg-gray-900 rounded-lg cursor-pointer"
        width={800}
        height={200}
        onClick={handleCanvasClick}
      />

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>

        <div className="flex items-center justify-center space-x-2">
          <Button variant="outline" size="icon" onClick={handleSkipBack}>
            <SkipBack className="h-4 w-4" />
          </Button>

          <Button variant="default" size="icon" onClick={handlePlayPause}>
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>

          <Button variant="outline" size="icon" onClick={handleSkipForward}>
            <SkipForward className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <audio ref={props.audioRef} src={props.audioUrl} className="hidden" />
    </div>
  );
};
