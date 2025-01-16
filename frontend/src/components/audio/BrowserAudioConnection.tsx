import { createSession, storeSession } from "@/utils/apiCalls";
import { ReloadIcon } from "@radix-ui/react-icons";
import { useEffect } from "react";
import { useRef } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";

export const BrowserAudioConnection = (props: {
  userInfo: Record<string, string>;
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [settingUpSession, setSettingUpSession] = useState(false);
  const [dataChannel, setDataChannel] = useState<RTCDataChannel | null>(null);
  const sessionData = useRef<Record<string, string>[]>([]);
  const sessionId = useRef<string | null>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const pendingAudio = useRef<boolean>(false);
  const hangUpRequested = useRef<boolean>(false);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.addEventListener("playing", () => {
        pendingAudio.current = true;
      });

      audioRef.current.addEventListener("ended", () => {
        pendingAudio.current = false;
      });

      // Also handle audio stall/suspend cases
      audioRef.current.addEventListener("stalled", () => {
        pendingAudio.current = false;
      });

      audioRef.current.addEventListener("suspend", () => {
        pendingAudio.current = false;
      });
    }
  }, []);

  const startSession = async () => {
    setSettingUpSession(true);
    // Get an ephemeral key from the Fastify server
    const tokenResponse = await createSession(props.userInfo);
    if (!tokenResponse) {
      setSettingUpSession(false);
      toast.error("Failed to start call, please try again");
      return;
    }
    const EPHEMERAL_KEY = tokenResponse.value;
    sessionId.current = tokenResponse.id;
    // Create a peer connection
    const pc = new RTCPeerConnection();

    // Set up to play remote audio from the model
    pc.ontrack = (e) => {
      if (audioRef.current) {
        audioRef.current.srcObject = e.streams[0];
      }
    };

    // Add local audio track for microphone input in the browser
    const ms = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    pc.addTrack(ms.getTracks()[0]);

    // Set up data channel for sending and receiving events
    const dc = pc.createDataChannel("oai-events");
    setDataChannel(dc);

    // Start the session using the Session Description Protocol (SDP)
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const sdpResponse = await fetch(
      `https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17`,
      {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${EPHEMERAL_KEY}`,
          "Content-Type": "application/sdp",
        },
      }
    );

    const answer = {
      type: "answer" as const,
      sdp: await sdpResponse.text(),
    };
    await pc.setRemoteDescription(answer);

    peerConnection.current = pc;
  };

  const performStop = async () => {
    if (dataChannel) {
      dataChannel.close();
    }
    if (peerConnection.current) {
      peerConnection.current.close();
    }

    if (sessionId.current && sessionData.current.length > 0) {
      await storeSession(
        sessionId.current,
        sessionData.current,
        props.userInfo
      );
    }

    setDataChannel(null);
    peerConnection.current = null;
    sessionId.current = null;
    sessionData.current = [];
    setIsSessionActive(false);
  };

  const startCleanupCheck = () => {
    const checkInterval = setInterval(() => {
      if (!pendingAudio.current && !hangUpRequested.current) {
        clearInterval(checkInterval);
        performStop();
      }
    }, 100);

    setTimeout(() => {
      clearInterval(checkInterval);
      performStop();
    }, 15000);
  };

  // Attach event listeners to the data channel when a new one is created
  useEffect(() => {
    if (dataChannel) {
      // Append new server events to the list
      dataChannel.addEventListener("message", (e) => {
        const event = JSON.parse(e.data);
        sessionData.current.push(event);
        if (
          event.type === "response.function_call_arguments.done" &&
          event.name === "hang_up"
        ) {
          hangUpRequested.current = true;
          startCleanupCheck();
        }
      });

      // Set session active when the data channel is opened
      dataChannel.addEventListener("open", () => {
        setIsSessionActive(true);
        setSettingUpSession(false);
      });
    }
  }, [dataChannel]);

  return (
    <div className="flex justify-end">
      <Button
        onClick={() => {
          if (isSessionActive) {
            performStop();
          } else {
            startSession();
          }
        }}
        variant={isSessionActive ? "destructive" : "default"}
      >
        {isSessionActive ? "Hang Up" : "Test Call"}
        {settingUpSession && (
          <ReloadIcon className="animate-spin ml-2 h-4 w-4" />
        )}
      </Button>
      <audio ref={audioRef} autoPlay className="hidden" />
    </div>
  );
};
