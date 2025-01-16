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
  getAudioStreamUrl,
  getAudioTranscript,
  getPlayAudioUrl,
  hangUp,
  streamMetadata,
} from "@/utils/apiCalls";
import { toast } from "sonner";
import { LoadingView } from "./Loader";
import { AudioPlayer } from "./audio/AudioPlayer";
import { loadAndFormatDate } from "@/utils/dateFormat";
import { LiveAudioPlayer } from "./audio/LiveAudioPlayer";

export const CallDisplay = (props: {
  call: PhoneCallMetadata | null;
  setCall: (call: PhoneCallMetadata | null) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [transcriptLoading, setTranscriptLoading] = useState(true);
  const [audioTranscript, setAudioTranscript] = useState<{
    speaker_segments: SpeakerSegment[];
    bar_heights: BarHeight[];
    total_duration: number;
  }>({ speaker_segments: [], bar_heights: [], total_duration: 0 });
  const audioRef = useRef<HTMLAudioElement>(null);
  const currentSegment = useRef<SpeakerSegment | null>(null);
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

  return (
    <Sheet
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          props.setCall(null);
        }
        setOpen(open);
      }}
    >
      <SheetContent className="space-y-2 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Call Audio</SheetTitle>
          <SheetDescription>
            {props.call?.created_at && loadAndFormatDate(props.call.created_at)}
          </SheetDescription>
        </SheetHeader>
        {transcriptLoading ? (
          <LoadingView text="Loading call..." />
        ) : (
          <div>
            {audioTranscript.speaker_segments.length > 0 && props.call && (
              <AudioPlayer
                audioUrl={getPlayAudioUrl(props.call.id)}
                audioRef={audioRef}
                currentSegment={currentSegment}
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
      </SheetContent>
    </Sheet>
  );
};

export const LiveCallDisplay = (props: {
  phoneCallId: string | null;
  setPhoneCallId: (phoneCallId: string | null) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [speakerSegments, setSpeakerSegments] = useState<SpeakerSegment[]>([]);
  const currentSegment = useRef<SpeakerSegment | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [callEnded, setCallEnded] = useState(false);

  const handleHangUp = async () => {
    if (!props.phoneCallId) return;
    const response = await hangUp(props.phoneCallId);
    if (response === false) {
      toast.error("Failed to hang up call, please try again");
    } else {
      toast.success("Hanging up call...");
      props.setPhoneCallId(null);
      setSpeakerSegments([]);
      currentSegment.current = null;
      setOpen(false);
    }
  };

  const runMetadataStream = async () => {
    if (!props.phoneCallId) return;
    try {
      for await (const payload of streamMetadata(props.phoneCallId)) {
        console.log(payload);
        if (payload.type === "call_end") {
          setCallEnded(true);
          break;
        } else {
          setSpeakerSegments(payload.data);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!props.phoneCallId) return;
    setOpen(true);

    // kick off streamingSpeakerSegments in the background
    (async () => {
      await runMetadataStream();
    })();
  }, [props.phoneCallId]);

  return (
    <Sheet
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          props.setPhoneCallId(null);
          setSpeakerSegments([]);
          currentSegment.current = null;
        }
        setOpen(open);
      }}
    >
      <SheetContent className="space-y-2 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Live Call Audio</SheetTitle>
          <SheetDescription>
            The audio will be a few seconds behind the actual call
          </SheetDescription>
        </SheetHeader>
        {props.phoneCallId && (
          <div>
            <LiveAudioPlayer
              audioRef={audioRef}
              audioUrl={getAudioStreamUrl(props.phoneCallId)}
              speakerSegments={speakerSegments}
              handleHangUp={handleHangUp}
              callEnded={callEnded}
            />
            <AudioTranscriptDisplay
              segments={speakerSegments}
              currentSegment={currentSegment}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
