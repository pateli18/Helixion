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
  getAudioTranscript,
  getBrowserCallUrl,
  getPlayAudioUrl,
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
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [transcriptLoading, setTranscriptLoading] = useState(true);
  const [audioTranscript, setAudioTranscript] = useState<{
    speaker_segments: SpeakerSegment[];
    bar_heights: BarHeight[];
    total_duration: number;
  }>({ speaker_segments: [], bar_heights: [], total_duration: 0 });
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentSegment, setCurrentSegment] = useState<SpeakerSegment | null>(
    null
  );
  useEffect(() => {
    if (!props.call) return;
    setOpen(true);
    setTranscriptLoading(true);
    getAudioTranscript(props.call.id).then((segments) => {
      if (segments !== null) {
        setAudioTranscript(segments);
      } else {
        toast.error("Failed to fetch audio transcript");
      }
      setTranscriptLoading(false);
    });
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
          {audioTranscript.speaker_segments.length > 0 && props.call && (
            <AudioPlayer
              audioUrl={getPlayAudioUrl(props.call.id)}
              audioRef={audioRef}
              setCurrentSegment={setCurrentSegment}
              speakerSegments={audioTranscript.speaker_segments}
              barHeights={audioTranscript.bar_heights}
              totalDuration={audioTranscript.total_duration}
            />
          )}
          <AudioTranscriptDisplay
            segments={audioTranscript.speaker_segments}
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
  const [open, setOpen] = useState(false);
  const [speakerSegments, setSpeakerSegments] = useState<SpeakerSegment[]>([]);
  const [currentSegment, setCurrentSegment] = useState<SpeakerSegment | null>(
    null
  );
  const [callEnded, setCallEnded] = useState(false);
  const outputWorkletRef = useRef<AudioWorkletNode | null>(null);

  const handleHangUp = async () => {
    if (!props.phoneCallId) return;
    const response = await hangUp(props.phoneCallId);
    if (response === false) {
      toast.error("Failed to hang up call, please try again");
    } else {
      toast.success("Hanging up call...");
    }
  };

  const runListenInStream = async () => {
    if (!props.phoneCallId) return;
    try {
      for await (const payload of listenInStream(props.phoneCallId)) {
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
