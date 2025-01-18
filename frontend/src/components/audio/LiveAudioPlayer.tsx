import { SpeakerSegment } from "@/types";
import { MutableRefObject, useEffect, useRef, useState } from "react";
import { canvasDraw } from "./visualizationUtils";
import { Button } from "../ui/button";
import { formatTime } from "@/utils/dateFormat";
import { cn } from "@/lib/utils";

export const LiveAudioPlayer = (props: {
  outputWorkletRef: MutableRefObject<AudioWorkletNode | null>;
  speakerSegments?: SpeakerSegment[];
  setCurrentSegment: (segment: SpeakerSegment | null) => void;
  handleHangUp: () => void;
  callEnded: boolean;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number>();
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const speakerSegmentsRef = useRef<SpeakerSegment[]>(
    props.speakerSegments ?? []
  );

  useEffect(() => {
    speakerSegmentsRef.current = props.speakerSegments ?? [];
  }, [props.speakerSegments]);

  useEffect(() => {
    if (props.callEnded) {
      cleanup();
    }
  }, [props.callEnded]);

  useEffect(() => {
    initializeAudioContext().then(() => {
      draw();
    });

    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    if (props.outputWorkletRef.current) {
      props.outputWorkletRef.current = null;
    }
    if (analyserNodeRef.current) {
      analyserNodeRef.current = null;
    }
    if (audioContextRef.current?.state !== "closed") {
      audioContextRef.current?.close();
    }
  };

  const initializeAudioContext = async () => {
    audioContextRef.current = new AudioContext({
      latencyHint: "interactive",
      sampleRate: 8000,
    });
    await audioContextRef.current!.audioWorklet.addModule(
      "pcm-output-processor.js"
    );
    props.outputWorkletRef.current = new AudioWorkletNode(
      audioContextRef.current!,
      "pcm-output-processor",
      {
        processorOptions: {
          inputSampleRate: 8000,
        },
      }
    );

    analyserNodeRef.current = audioContextRef.current!.createAnalyser();
    analyserNodeRef.current.fftSize = 2048;

    props.outputWorkletRef.current.connect(analyserNodeRef.current);
    analyserNodeRef.current.connect(audioContextRef.current!.destination);
  };

  const draw = () => {
    if (!canvasRef.current || !audioContextRef.current) return;

    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext("2d")!;
    animationRef.current = requestAnimationFrame(draw);

    const bufferLength = analyserNodeRef.current!.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserNodeRef.current!.getByteFrequencyData(dataArray);
    const currentTime = audioContextRef.current.currentTime; // Get time from AudioContext
    setCurrentTime(currentTime);

    const relevantSpeakerSegment = speakerSegmentsRef.current?.findLast(
      (segment) => segment.timestamp <= currentTime
    );
    props.setCurrentSegment(relevantSpeakerSegment ?? null);

    canvasDraw(
      canvas,
      canvasCtx,
      dataArray,
      relevantSpeakerSegment?.speaker ?? "User"
    );
  };

  return (
    <div className="w-full mx-auto p-4 space-y-4">
      <canvas
        ref={canvasRef}
        className={cn(
          "w-full h-48 rounded-lg cursor-pointer",
          (props.callEnded || currentTime === 0) && "hidden"
        )}
        width={800}
        height={200}
      />

      <div className="space-y-2">
        <div
          className={cn(
            "flex items-center justify-end text-sm text-gray-500",
            currentTime === 0 && "hidden"
          )}
        >
          <span>{formatTime(currentTime)}</span>
        </div>
        <div className="flex items-center justify-center space-x-2">
          {!props.callEnded && currentTime === 0 && (
            <Button variant="secondary" size="sm" disabled>
              Dialing...
            </Button>
          )}
          {props.callEnded ? (
            <Button variant="secondary" size="sm" disabled>
              Call Ended
            </Button>
          ) : (
            <Button
              variant="destructive"
              size="sm"
              onClick={props.handleHangUp}
            >
              Hang Up
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
