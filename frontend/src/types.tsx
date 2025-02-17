export type PhoneCallStatus =
  | "queued"
  | "ringing"
  | "in-progress"
  | "completed"
  | "busy"
  | "failed"
  | "no-answer"
  | "initiated";

export type AgentMetadata = {
  base_id: string;
  name: string;
  version_id: string;
};

export type PhoneCallType = "inbound" | "outbound";

export type PhoneCallMetadata = {
  id: string;
  call_sid: string;
  from_phone_number: string;
  to_phone_number: string;
  input_data: Record<string, unknown>;
  status: PhoneCallStatus;
  created_at: string;
  duration?: number;
  recording_available: boolean;
  agent_metadata: AgentMetadata | null;
  call_type: PhoneCallType;
  end_reason: string | null;
  initiator: string | null;
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
  sample_values: Record<string, string>;
  user_email: string;
  tool_configuration: Record<string, any>;
};

export type AnalyticsTag = {
  id: string;
  tag: string;
  phone_call_id: string;
};

export type AnalyticsReport = {
  id: string;
  name: string;
  text: string;
};

export type AnalyticsGroup = {
  id: string;
  name: string;
  tags: AnalyticsTag[];
  reports: AnalyticsReport[];
};

export type DocumentMetadata = {
  id: string;
  name: string;
  size: number;
  mime_type: string;
  created_at: string;
};

export type KnowledgeBase = {
  id: string;
  name: string;
  documents: DocumentMetadata[];
};

export type AgentPhoneNumber = {
  id: string;
  phone_number: string;
  incoming: boolean;
  agent: AgentMetadata | null;
};
