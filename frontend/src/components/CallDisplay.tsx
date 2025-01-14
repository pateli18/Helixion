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
import { getAudioTranscript, getPlayAudioUrl } from "@/utils/apiCalls";
import { toast } from "sonner";
import { LoadingView } from "./Loader";
import { AudioPlayer } from "./audio/AudioPlayer";
import { loadAndFormatDate } from "@/utils/dateFormat";

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
