import { useEffect } from "react";
import { useRef } from "react";
import { useState } from "react";
import { Button } from "../ui/button";
import { formatTime } from "@/utils/dateFormat";
import { cn } from "@/lib/utils";
import { canvasDraw } from "./visualizationUtils";

export const BrowserAudioPlayer = (props: {
  websocketRef: React.MutableRefObject<WebSocket | null>;
  outputWorkletRef: React.MutableRefObject<AudioWorkletNode | null>;
  callEnded: boolean;
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number>();
  const streamRef = useRef<MediaStream | null>(null);
  const inputWorkletRef = useRef<AudioWorkletNode | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const activeSpeakerRef = useRef<"User" | "Assistant">("User");
  const [currentTime, setCurrentTime] = useState(0);

  const cleanup = () => {
    if (props.websocketRef.current?.readyState === WebSocket.OPEN) {
      props.websocketRef.current.close();
    }

    // Clean up media stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current?.state !== "closed") {
      audioContextRef.current?.close();
    }

    if (inputWorkletRef.current) {
      inputWorkletRef.current = null;
    }

    if (inputAnalyserRef.current) {
      inputAnalyserRef.current = null;
    }

    if (props.outputWorkletRef.current) {
      props.outputWorkletRef.current = null;
    }

    if (outputAnalyserRef.current) {
      outputAnalyserRef.current = null;
    }
  };
  // Cleanup on unmount
  useEffect(() => {
    initializeAudioContext().then(() => {
      draw();
    });
    return () => {
      cleanup();
    };
  }, []);

  const initializeAudioContext = async () => {
    cleanup();

    // setup audio context
    audioContextRef.current = new AudioContext({
      latencyHint: "interactive",
      sampleRate: 24000,
    });

    // setup mic stream
    streamRef.current = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 24000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    // create the mic source
    const micSource = audioContextRef.current!.createMediaStreamSource(
      streamRef.current!
    );

    // create the mic analyser
    inputAnalyserRef.current = audioContextRef.current!.createAnalyser();
    inputAnalyserRef.current.fftSize = 2048;
    micSource.connect(inputAnalyserRef.current!);

    // load input worklet
    await audioContextRef.current!.audioWorklet.addModule(
      "pcm-input-processor.js"
    );
    inputWorkletRef.current = new AudioWorkletNode(
      audioContextRef.current!,
      "pcm-input-processor"
    );

    inputWorkletRef.current.port.onmessage = (event) => {
      if (event.data.type === "mic-data") {
        const pcmData = new Int16Array(event.data.buffer);
        const pcmBytes = new Uint8Array(pcmData.buffer);
        const base64Data = btoa(String.fromCharCode(...pcmBytes));

        props.websocketRef.current?.send(
          JSON.stringify({
            event: "media",
            payload: base64Data,
          })
        );
      }
    };

    // connect microphone to pcm processor
    inputAnalyserRef.current!.connect(inputWorkletRef.current!);

    // load output worklet
    await audioContextRef.current!.audioWorklet.addModule(
      "pcm-output-processor.js"
    );
    props.outputWorkletRef.current = new AudioWorkletNode(
      audioContextRef.current!,
      "pcm-output-processor",
      {
        processorOptions: {
          inputSampleRate: 24000,
        },
      }
    );

    props.outputWorkletRef.current.port.onmessage = (e) => {
      if (e.data?.type === "chunkEnd") {
        props.websocketRef.current?.send(JSON.stringify({ event: "mark" }));
        activeSpeakerRef.current = "Assistant";
      } else if (e.data?.type === "noOutputData") {
        activeSpeakerRef.current = "User";
      }
    };

    outputAnalyserRef.current = audioContextRef.current!.createAnalyser();
    outputAnalyserRef.current.fftSize = 256;

    // connect pcm processor to websocket
    props.outputWorkletRef.current.connect(outputAnalyserRef.current!);
    outputAnalyserRef.current!.connect(audioContextRef.current!.destination);
  };

  const draw = () => {
    if (!canvasRef.current || !audioContextRef.current) return;

    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext("2d")!;
    animationRef.current = requestAnimationFrame(draw);

    const relevantAnalyser =
      activeSpeakerRef.current === "User"
        ? inputAnalyserRef.current
        : outputAnalyserRef.current;

    const bufferLength = relevantAnalyser!.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    relevantAnalyser!.getByteFrequencyData(dataArray);
    const currentTime = audioContextRef.current.currentTime; // Get time from AudioContext
    setCurrentTime(currentTime);

    canvasDraw(canvas, canvasCtx, dataArray, activeSpeakerRef.current);
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
              onClick={() => {
                props.websocketRef.current?.send(
                  JSON.stringify({ event: "hangup" })
                );
                props.outputWorkletRef.current?.port.postMessage({
                  type: "clear-buffers",
                });
                cleanup();
              }}
            >
              Hang Up
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
