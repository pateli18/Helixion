import { SpeakerSegment } from "@/types";
import { formatTime } from "@/utils/dateFormat";
import { MutableRefObject } from "react";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import { Badge } from "../ui/badge";

const SegmentDisplay = (props: {
  segment: SpeakerSegment;
  audioRef?: MutableRefObject<HTMLAudioElement | null>;
  currentSegment: SpeakerSegment | null;
}) => {
  const handleTimeClick = () => {
    if (props.audioRef && props.audioRef.current) {
      props.audioRef.current.currentTime = props.segment.timestamp;
    }
  };

  const isCurrentSegment =
    props.currentSegment?.item_id === props.segment.item_id;

  return (
    <div
      className={cn("p-2 rounded space-x-1", isCurrentSegment && "bg-blue-100")}
    >
      <Button
        variant="link"
        onClick={handleTimeClick}
        className="text-blue-500 hover:underline px-0"
        disabled={!props.audioRef}
      >
        [{formatTime(props.segment.timestamp)}]
      </Button>
      <Badge variant="secondary">{props.segment.speaker}</Badge>
      <div className="whitespace-pre-wrap text-sm">
        {props.segment.transcript}
      </div>
    </div>
  );
};

export const AudioTranscriptDisplay = (props: {
  segments: SpeakerSegment[];
  audioRef?: MutableRefObject<HTMLAudioElement | null>;
  currentSegment: SpeakerSegment | null;
}) => {
  return (
    <div className="space-y-2">
      {props.segments
        .filter((segment) => segment.transcript.length > 0)
        .map((segment) => (
          <SegmentDisplay
            key={segment.item_id}
            segment={segment}
            audioRef={props.audioRef}
            currentSegment={props.currentSegment}
          />
        ))}
      {props.segments.length === 0 && (
        <div className="text-center text-gray-500">
          No conversation exists for this call.
        </div>
      )}
    </div>
  );
};
