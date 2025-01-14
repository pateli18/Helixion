import { SpeakerSegment } from "@/types";
import { formatTime } from "@/utils/dateFormat";
import { MutableRefObject } from "react";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import { Badge } from "../ui/badge";

const SegmentDisplay = (props: {
  segment: SpeakerSegment;
  audioRef: MutableRefObject<HTMLAudioElement | null>;
  currentSegment: MutableRefObject<SpeakerSegment | null>;
}) => {
  const handleTimeClick = () => {
    if (props.audioRef.current) {
      props.audioRef.current.currentTime = props.segment.timestamp;
    }
  };

  const isCurrentSegment =
    props.currentSegment.current?.item_id === props.segment.item_id;

  return (
    <div
      className={cn("p-2 rounded space-x-1", isCurrentSegment && "bg-blue-100")}
    >
      <Button
        variant="link"
        onClick={handleTimeClick}
        className="text-blue-500 hover:underline px-0"
      >
        [{formatTime(props.segment.timestamp)}]
      </Button>
      <Badge
        variant={props.segment.speaker === "User" ? "default" : "secondary"}
      >
        {props.segment.speaker}
      </Badge>
      <div className="whitespace-pre-wrap text-sm">
        {props.segment.transcript}
      </div>
    </div>
  );
};

export const AudioTranscriptDisplay = (props: {
  segments: SpeakerSegment[];
  audioRef: MutableRefObject<HTMLAudioElement | null>;
  currentSegment: MutableRefObject<SpeakerSegment | null>;
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
    </div>
  );
};
