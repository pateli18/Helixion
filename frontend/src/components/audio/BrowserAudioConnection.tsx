import { browserCall, getBrowserCallUrl } from "@/utils/apiCalls";
import { useEffect } from "react";
import { useRef } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { ReloadIcon } from "@radix-ui/react-icons";

export const BrowserAudioConnection = (props: {
  agentId: string;
  userInfo: Record<string, string>;
}) => {
  const [connectionLoading, setConnectionLoading] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);

  const websocketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputWorkletRef = useRef<AudioWorkletNode | null>(null);
  const outputWorkletRef = useRef<AudioWorkletNode | null>(null);

  const cleanup = () => {
    if (websocketRef.current?.readyState === WebSocket.OPEN) {
      websocketRef.current.close();
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

    if (outputWorkletRef.current) {
      outputWorkletRef.current = null;
    }

    setIsSessionActive(false);
  };
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const connectWebSocket = (phoneCallId: string) => {
    const ws = new WebSocket(getBrowserCallUrl(phoneCallId));

    ws.onopen = () => {
      setIsSessionActive(true);
      websocketRef.current?.send(
        JSON.stringify({
          event: "start",
        })
      );
    };

    ws.onclose = () => {
      setIsSessionActive(false);
    };

    ws.onerror = (e) => {
      console.error("WebSocket connection error", e);
    };

    ws.onmessage = async (event) => {
      try {
        // parse json
        const data = JSON.parse(event.data);

        if (data.event === "clear") {
          outputWorkletRef.current?.port.postMessage({
            type: "clear-buffers",
          });
        } else if (data.event === "media") {
          // Send the base64 data directly to the worklet for processing
          const pcm16Data = atob(data.payload);
          const buffer = new ArrayBuffer(pcm16Data.length);
          const view = new Uint8Array(buffer);

          for (let i = 0; i < pcm16Data.length; i++) {
            view[i] = pcm16Data.charCodeAt(i);
          }

          outputWorkletRef.current?.port.postMessage(
            {
              type: "process-audio",
              payload: view,
            },
            [buffer]
          );
        }
      } catch (err) {
        console.error("Error processing server event:", err);
      }
    };

    websocketRef.current = ws;
  };

  // Handle recording start/stop
  const startCall = async () => {
    setConnectionLoading(true);
    try {
      const response = await browserCall(props.agentId, props.userInfo);
      if (response === null) {
        throw new Error("Failed to start call");
      }

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

          websocketRef.current?.send(
            JSON.stringify({
              event: "media",
              payload: base64Data,
            })
          );
        }
      };

      // connect microphone to pcm processor
      micSource.connect(inputWorkletRef.current!);

      // load output worklet
      await audioContextRef.current!.audioWorklet.addModule(
        "pcm-output-processor.js"
      );
      outputWorkletRef.current = new AudioWorkletNode(
        audioContextRef.current!,
        "pcm-output-processor"
      );

      outputWorkletRef.current.port.onmessage = (e) => {
        if (e.data?.type === "chunkEnd") {
          websocketRef.current?.send(JSON.stringify({ event: "mark" }));
        }
      };

      // connect pcm processor to websocket
      outputWorkletRef.current.connect(audioContextRef.current!.destination);

      connectWebSocket(response.phone_call_id);
    } catch (err) {
      console.error("Error starting call", err);
      toast.error("Error starting call, please try again");
      cleanup();
    } finally {
      setConnectionLoading(false);
    }
  };

  return (
    <div className="flex justify-end">
      <Button
        onClick={() => {
          if (isSessionActive) {
            cleanup();
          } else {
            startCall();
          }
        }}
        variant={isSessionActive ? "destructive" : "default"}
      >
        {isSessionActive ? "Hang Up" : "Test Call"}
        {connectionLoading && <ReloadIcon className="w-4 h-4 animate-spin" />}
      </Button>
    </div>
  );
};
