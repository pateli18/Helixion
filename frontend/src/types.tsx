export type PhoneCallStatus =
  | "queued"
  | "ringing"
  | "in-progress"
  | "completed"
  | "busy"
  | "failed"
  | "no-answer";

export type AgentMetadata = {
  base_id: string;
  name: string;
  version_id: string;
};

export type PhoneCallType = "inbound" | "outbound";

export type PhoneCallMetadata = {
  id: string;
  from_phone_number: string;
  to_phone_number: string;
  input_data: Record<string, unknown>;
  status: PhoneCallStatus;
  created_at: string;
  duration?: number;
  recording_available: boolean;
  agent_metadata: AgentMetadata;
  call_type: PhoneCallType;
};

export type SpeakerSegment = {
  timestamp: number;
  speaker: "User" | "Assistant";
  transcript: string;
  item_id: string;
};

export type BarHeight = {
  height: number;
  speaker: "User" | "Assistant";
};

export type Agent = {
  id: string;
  name: string;
  system_message: string;
  base_id: string;
  active: boolean;
  created_at: string;
  document_metadata: DocumentMetadata[];
  sample_values: Record<string, string>;
  incoming_phone_number: string | null;
};

export type DocumentMetadata = {
  id: string;
  name: string;
};
