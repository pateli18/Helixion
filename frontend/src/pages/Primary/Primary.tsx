import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createSession, storeSession } from "@/utils/apiCalls";
import { ReloadIcon } from "@radix-ui/react-icons";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const AudioConnection = (props: {
  name: string;
  email: string;
  age: string;
  location: string;
}) => {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [settingUpSession, setSettingUpSession] = useState(false);
  const [dataChannel, setDataChannel] = useState<RTCDataChannel | null>(null);
  const [finalData, setFinalData] = useState<Record<string, string> | null>(
    null
  );
  const sessionData = useRef<Record<string, string>[]>([]);
  const sessionId = useRef<string | null>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const audioElement = useRef<HTMLAudioElement | null>(null);

  const startSession = async () => {
    setSettingUpSession(true);
    // Get an ephemeral key from the Fastify server
    const tokenResponse = await createSession({
      name: props.name,
      email: props.email,
      age: props.age,
      location: props.location,
    });
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
      if (audioElement.current) {
        audioElement.current.srcObject = e.streams[0];
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

  // Stop current session, clean up peer connection and data channel
  const stopSession = () => {
    setIsSessionActive(false);

    // Allow time for final events to flow through
    setTimeout(async () => {
      if (dataChannel) {
        dataChannel.close();
      }
      if (peerConnection.current) {
        peerConnection.current.close();
      }

      if (sessionId.current && sessionData.current.length > 0) {
        const response = await storeSession(
          sessionId.current,
          sessionData.current,
          props
        );
        if (response !== null) {
          setFinalData(response);
        }
      }

      setDataChannel(null);
      peerConnection.current = null;
      sessionId.current = null;
      sessionData.current = [];
    }, 5000); // 5 second delay
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
          stopSession();
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
    <div>
      <audio ref={audioElement} autoPlay />
      <Button
        onClick={isSessionActive ? stopSession : startSession}
        variant={isSessionActive ? "destructive" : "default"}
      >
        {isSessionActive ? "Hang Up" : "Call Me"}{" "}
        {settingUpSession && (
          <ReloadIcon className="animate-spin ml-2 h-4 w-4" />
        )}
      </Button>
      {finalData && !settingUpSession && !isSessionActive && (
        <div className="mt-4 space-y-1">
          <div className="text-md text-gray-500">Finalized Details</div>
          <SampleField name="Name" value={finalData.name} />
          <SampleField name="Email" value={finalData.email} />
          <SampleField name="Age" value={finalData.age} />
          <SampleField name="Location" value={finalData.location} />
        </div>
      )}
    </div>
  );
};

const SampleField = (props: {
  name: string;
  value: string;
  setValue?: React.Dispatch<React.SetStateAction<string>>;
}) => {
  return (
    <div className="flex items-center gap-2">
      <div className="font-bold text-sm">{props.name}</div>
      <Input
        type="text"
        value={props.value}
        onChange={(e) => {
          props.setValue?.(e.target.value);
        }}
        disabled={!props.setValue}
        className={cn("max-w-[600px]")}
      />
    </div>
  );
};

export const PrimaryPage = () => {
  const [name, setName] = useState("Joe Smith");
  const [email, setEmail] = useState("joe_smith@gmail.com");
  const [age, setAge] = useState("30");
  const [location, setLocation] = useState("New York, NY");

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="space-y-4 px-4 my-16">
        <div className="text-md text-gray-500">Enter Test Details</div>
        <SampleField name="Name" value={name} setValue={setName} />
        <SampleField name="Email" value={email} setValue={setEmail} />
        <SampleField name="Age" value={age} setValue={setAge} />
        <SampleField name="Location" value={location} setValue={setLocation} />
        <AudioConnection
          name={name}
          email={email}
          age={age}
          location={location}
        />
      </div>
    </div>
  );
};
