import { LiveAudioPlayer } from "@/components/audio/LiveAudioPlayer";
import { LiveCallDisplay } from "@/components/CallDisplay";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  createSession,
  hangUp,
  outboundCall,
  storeSession,
  streamSpeakerSegments,
} from "@/utils/apiCalls";
import { ReloadIcon } from "@radix-ui/react-icons";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const AudioConnection = (props: { userInfo: Record<string, string> }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [settingUpSession, setSettingUpSession] = useState(false);
  const [dataChannel, setDataChannel] = useState<RTCDataChannel | null>(null);
  const sessionData = useRef<Record<string, string>[]>([]);
  const sessionId = useRef<string | null>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);

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

  // Stop current session, clean up peer connection and data channel
  const stopSession = (timeout: number) => {
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
    }, timeout);
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
          stopSession(10000);
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
            stopSession(0);
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

const CallPhoneNumber = (props: {
  handleCallPhoneNumber: (phoneNumber: string) => Promise<void>;
}) => {
  const [isCalling, setIsCalling] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [isValidPhoneNumber, setIsValidPhoneNumber] = useState(false);
  const validatePhoneNumber = (phoneNumber: string) => {
    // check starts with + and is 11 digits long and only contains numbers except for the +
    return (
      phoneNumber.startsWith("+") &&
      phoneNumber.slice(1).match(/^\d+$/) !== null
    );
  };

  const onClick = async () => {
    if (phoneNumber) {
      setIsCalling(true);
      await props.handleCallPhoneNumber(phoneNumber);
      setIsCalling(false);
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Button
          disabled={phoneNumber !== null && !isValidPhoneNumber && !isCalling}
          onClick={onClick}
        >
          Call Phone Number{" "}
          {isCalling && <ReloadIcon className="animate-spin ml-2 h-4 w-4" />}
        </Button>
        <Input
          type="tel"
          placeholder="Enter phone number with country code"
          value={phoneNumber ?? ""}
          onChange={(e) => {
            setPhoneNumber(e.target.value);
            setIsValidPhoneNumber(validatePhoneNumber(e.target.value));
          }}
          className={cn(
            "max-w-[600px]",
            !isValidPhoneNumber && "border-red-500"
          )}
        />
      </div>
      {!isValidPhoneNumber && phoneNumber && (
        <div className="text-sm text-red-500">
          Must include the country code and start with +
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
  const [phoneCallId, setPhoneCallId] = useState<string | null>(null);

  const handleCallPhoneNumber = async (phoneNumber: string) => {
    const response = await outboundCall(phoneNumber, {
      name,
      email,
      age,
      location,
    });
    if (response === null) {
      toast.error("Failed to start call, please try again");
    } else {
      setPhoneCallId(response.phone_call_id);
    }
  };

  return (
    <Layout title="Dialer">
      <div className="flex items-center justify-center">
        <div className="space-y-4 px-4">
          {phoneCallId === null && (
            <AudioConnection userInfo={{ name, email, age, location }} />
          )}
          <div className="text-md text-gray-500">Enter Details</div>
          <SampleField name="Name" value={name} setValue={setName} />
          <SampleField name="Email" value={email} setValue={setEmail} />
          <SampleField name="Age" value={age} setValue={setAge} />
          <SampleField
            name="Location"
            value={location}
            setValue={setLocation}
          />
          {phoneCallId === null && (
            <CallPhoneNumber handleCallPhoneNumber={handleCallPhoneNumber} />
          )}
          <LiveCallDisplay
            phoneCallId={phoneCallId}
            setPhoneCallId={setPhoneCallId}
          />
        </div>
      </div>
    </Layout>
  );
};
