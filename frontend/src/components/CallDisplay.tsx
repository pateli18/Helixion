import { BarHeight, PhoneCallMetadata, SpeakerSegment } from "@/types";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";
import { AudioTranscriptDisplay } from "./audio/AudioTranscript";
import { useEffect, useRef, useState } from "react";
import {
  getAudioPlayback,
  getBrowserCallUrl,
  hangUp,
  listenInStream,
} from "@/utils/apiCalls";
import { toast } from "sonner";
import { LoadingView } from "./Loader";
import { AudioPlayer } from "./audio/AudioPlayer";
import { loadAndFormatDate } from "@/utils/dateFormat";
import { LiveAudioPlayer } from "./audio/LiveAudioPlayer";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerDescription,
  DrawerTitle,
} from "./ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { BrowserAudioPlayer } from "./audio/BrowserAudioPlayer";
import { useUserContext } from "@/contexts/UserContext";

const SheetView = (props: {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
}) => {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent className="space-y-2 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{props.title}</SheetTitle>
          <SheetDescription>{props.description}</SheetDescription>
        </SheetHeader>
        {props.children}
      </SheetContent>
    </Sheet>
  );
};

const DrawerView = (props: {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
}) => {
  return (
    <Drawer open={props.open} onOpenChange={props.onOpenChange}>
      <DrawerContent className="h-[90%]">
        <DrawerHeader>
          <DrawerTitle>{props.title}</DrawerTitle>
          <DrawerDescription>{props.description}</DrawerDescription>
        </DrawerHeader>
        <div className="space-y-2 overflow-y-auto">{props.children}</div>
      </DrawerContent>
    </Drawer>
  );
};

export const CallDisplay = (props: {
  call: PhoneCallMetadata | null;
  setCall: (call: PhoneCallMetadata | null) => void;
}) => {
  const { getAccessToken } = useUserContext();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [transcriptLoading, setTranscriptLoading] = useState(true);
  const [audioPlayback, setAudioPlayback] = useState<{
    speaker_segments: SpeakerSegment[];
    bar_heights: BarHeight[];
    total_duration: number;
    audio_url: string;
  }>({
    speaker_segments: [],
    bar_heights: [],
    total_duration: 0,
    audio_url: "",
  });
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentSegment, setCurrentSegment] = useState<SpeakerSegment | null>(
    null
  );

  const fetchAudioPlayback = async (callId: string) => {
    setTranscriptLoading(true);
    const accessToken = await getAccessToken();
    const playback = await getAudioPlayback(callId, accessToken);
    if (playback !== null) {
      // conver to blob url
      const blob = new Blob(
        [
          Uint8Array.from(atob(playback.audio_data_b64), (c) =>
            c.charCodeAt(0)
          ),
        ],
        { type: playback.content_type }
      );
      const audioURL = URL.createObjectURL(blob);

      setAudioPlayback({
        ...playback,
        audio_url: audioURL,
      });
    } else {
      toast.error("Failed to fetch audio playback");
    }
    setTranscriptLoading(false);
  };

  useEffect(() => {
    if (!props.call) return;
    setOpen(true);
    fetchAudioPlayback(props.call.id);
  }, [props.call?.id]);

  const onOpenChange = (open: boolean) => {
    if (!open) {
      props.setCall(null);
    }
    setOpen(open);
  };

  const title = "Call Audio";
  const description = props.call?.created_at
    ? loadAndFormatDate(props.call.created_at)
    : "";
  const components = (
    <>
      {transcriptLoading ? (
        <LoadingView text="Loading call..." />
      ) : (
        <div>
          {audioPlayback.speaker_segments.length > 0 && props.call && (
            <AudioPlayer
              callId={props.call.id}
              audioUrl={audioPlayback.audio_url}
              audioRef={audioRef}
              setCurrentSegment={setCurrentSegment}
              speakerSegments={audioPlayback.speaker_segments}
              barHeights={audioPlayback.bar_heights}
              totalDuration={audioPlayback.total_duration}
            />
          )}
          <AudioTranscriptDisplay
            segments={audioPlayback.speaker_segments}
            audioRef={audioRef}
            currentSegment={currentSegment}
          />
        </div>
      )}
    </>
  );

  return isMobile ? (
    <DrawerView
      title={title}
      description={description}
      open={open}
      onOpenChange={onOpenChange}
    >
      {components}
    </DrawerView>
  ) : (
    <SheetView
      title={title}
      description={description}
      open={open}
      onOpenChange={onOpenChange}
    >
      {components}
    </SheetView>
  );
};

export const LiveCallDisplay = (props: {
  phoneCallId: string | null;
  setPhoneCallId: (phoneCallId: string | null) => void;
}) => {
  const isMobile = useIsMobile();
  const { getAccessToken } = useUserContext();
  const [open, setOpen] = useState(false);
  const [speakerSegments, setSpeakerSegments] = useState<SpeakerSegment[]>([]);
  const [currentSegment, setCurrentSegment] = useState<SpeakerSegment | null>(
    null
  );
  const [callEnded, setCallEnded] = useState(false);
  const outputWorkletRef = useRef<AudioWorkletNode | null>(null);

  const handleHangUp = async () => {
    if (!props.phoneCallId) return;
    const accessToken = await getAccessToken();
    const response = await hangUp(props.phoneCallId, accessToken);
    if (response === false) {
      toast.error("Failed to hang up call, please try again");
    } else {
      toast.success("Hanging up call...");
    }
  };

  const runListenInStream = async () => {
    if (!props.phoneCallId) return;
    const accessToken = await getAccessToken();
    try {
      for await (const payload of listenInStream(
        props.phoneCallId,
        accessToken
      )) {
        if (payload.type === "call_end") {
          setCallEnded(true);
          break;
        } else if (payload.type === "speaker") {
          setSpeakerSegments(payload.data);
        } else {
          const pcm16Data = atob(payload.data);
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
      }
    } catch (e) {
      console.error(e);
    }
  };

  const onOpenChange = (open: boolean) => {
    if (!open) {
      props.setPhoneCallId(null);
      setSpeakerSegments([]);
      setCurrentSegment(null);
      setCallEnded(false);
    }
    setOpen(open);
  };

  useEffect(() => {
    if (!props.phoneCallId) return;
    setOpen(true);

    // kick off streamingSpeakerSegments in the background
    (async () => {
      await runListenInStream();
    })();
  }, [props.phoneCallId]);

  const title = "Live Call Audio";
  const description = "The audio will be a few seconds behind the actual call";
  const components = (
    <>
      {props.phoneCallId && (
        <div>
          <LiveAudioPlayer
            outputWorkletRef={outputWorkletRef}
            speakerSegments={speakerSegments}
            setCurrentSegment={setCurrentSegment}
            handleHangUp={handleHangUp}
            callEnded={callEnded}
          />
          <AudioTranscriptDisplay
            segments={speakerSegments}
            currentSegment={currentSegment}
          />
        </div>
      )}
    </>
  );

  return isMobile ? (
    <DrawerView
      title={title}
      description={description}
      open={open}
      onOpenChange={onOpenChange}
    >
      {components}
    </DrawerView>
  ) : (
    <SheetView
      title={title}
      description={description}
      open={open}
      onOpenChange={onOpenChange}
    >
      {components}
    </SheetView>
  );
};

export const BrowserCallDisplay = (props: {
  browserCallId: string | null;
  setBrowserCallId: (browserCallId: string | null) => void;
}) => {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [speakerSegments, setSpeakerSegments] = useState<SpeakerSegment[]>([]);
  const [currentSegment, setCurrentSegment] = useState<SpeakerSegment | null>(
    null
  );
  const [callEnded, setCallEnded] = useState(false);
  const websocketRef = useRef<WebSocket | null>(null);
  const outputWorkletRef = useRef<AudioWorkletNode | null>(null);

  const connectWebSocket = (phoneCallId: string) => {
    const ws = new WebSocket(getBrowserCallUrl(phoneCallId));

    ws.onopen = () => {
      websocketRef.current?.send(
        JSON.stringify({
          event: "start",
        })
      );
    };

    ws.onclose = () => {
      setCallEnded(true);
    };

    ws.onerror = (e) => {
      console.error("WebSocket connection error", e);
    };

    ws.onmessage = async (event) => {
      try {
        // parse json
        const data = JSON.parse(event.data);

        // TODO: handle speaker segements

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
        } else if (data.event === "speaker_segments") {
          setSpeakerSegments(data.payload);
        }
      } catch (err) {
        console.error("Error processing server event:", err);
      }
    };

    websocketRef.current = ws;
  };

  const onOpenChange = (open: boolean) => {
    if (!open) {
      props.setBrowserCallId(null);
      setSpeakerSegments([]);
      setCurrentSegment(null);
      setCallEnded(false);
    }
    setOpen(open);
  };

  useEffect(() => {
    if (!props.browserCallId) return;
    setOpen(true);

    connectWebSocket(props.browserCallId);
  }, [props.browserCallId]);

  const title = "Browser Call Audio";
  const description = "";
  const components = (
    <>
      {props.browserCallId && (
        <div>
          <BrowserAudioPlayer
            websocketRef={websocketRef}
            outputWorkletRef={outputWorkletRef}
            callEnded={callEnded}
          />
          <AudioTranscriptDisplay
            segments={speakerSegments}
            currentSegment={currentSegment}
          />
        </div>
      )}
    </>
  );

  return isMobile ? (
    <DrawerView
      title={title}
      description={description}
      open={open}
      onOpenChange={onOpenChange}
    >
      {components}
    </DrawerView>
  ) : (
    <SheetView
      title={title}
      description={description}
      open={open}
      onOpenChange={onOpenChange}
    >
      {components}
    </SheetView>
  );
};
