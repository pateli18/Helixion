import { PhoneCallMetadata, SpeakerSegment } from "@/types";
import { Sheet, SheetContent } from "./ui/sheet";
import { AudioTranscriptDisplay } from "./audio/AudioTranscript";
import { useEffect, useRef, useState } from "react";
import { getAudioTranscript } from "@/utils/apiCalls";
import { toast } from "sonner";
import { LoadingView } from "./Loader";
import { AudioPlayer } from "./audio/AudioPlayer";

export const CallDisplay = (props: {
  call: PhoneCallMetadata | null;
  setCall: (call: PhoneCallMetadata | null) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [transcriptLoading, setTranscriptLoading] = useState(true);
  const [audioTranscript, setAudioTranscript] = useState<SpeakerSegment[]>([]);
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
        {transcriptLoading ? (
          <LoadingView text="Loading call..." />
        ) : (
          <div>
            {audioTranscript.length > 0 && props.call && (
              <AudioPlayer
                audioUrl={`/api/v1/phone/play-audio/${props.call.id}`}
                audioRef={audioRef}
                currentSegment={currentSegment}
                speakerSegments={audioTranscript}
              />
            )}
            <AudioTranscriptDisplay
              segments={audioTranscript}
              audioRef={audioRef}
              currentSegment={currentSegment}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
