export type PhoneCallStatus =
  | "queued"
  | "ringing"
  | "in-progress"
  | "completed"
  | "busy"
  | "failed"
  | "no-answer";

export type PhoneCallMetadata = {
  id: string;
  from_phone_number: string;
  to_phone_number: string;
  input_data: Record<string, unknown>;
  status: PhoneCallStatus;
  created_at: string;
  duration?: number;
  recording_available: boolean;
};

export type SpeakerSegment = {
  timestamp: number;
  speaker: "User" | "Assistant";
  transcript: string;
  item_id: string;
};
