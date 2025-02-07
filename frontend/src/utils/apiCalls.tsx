import {
  Agent,
  AnalyticsGroup,
  BarHeight,
  PhoneCallMetadata,
  SpeakerSegment,
} from "@/types";
import Ajax from "./Ajax";

export let baseUrl = "";
if (import.meta.env.VITE_ENV === "prod") {
  baseUrl = "https://api.helixion.ai";
}

export const outboundCall = async (
  phoneNumber: string,
  agentId: string,
  userInfo: Record<string, string>,
  accessToken: string | null
) => {
  let response = null;
  try {
    response = await Ajax.req<{ phone_call_id: string }>({
      url: `${baseUrl}/api/v1/phone/outbound-call`,
      method: "POST",
      body: {
        phone_number: phoneNumber,
        agent_id: agentId,
        user_info: userInfo,
      },
      accessToken,
    });
  } catch (error) {
    console.error(error);
  }
  return response;
};

export const browserCall = async (
  agentId: string,
  userInfo: Record<string, string>,
  accessToken: string | null
) => {
  let response = null;
  try {
    response = await Ajax.req<{ phone_call_id: string }>({
      url: `${baseUrl}/api/v1/browser/call`,
      method: "POST",
      body: {
        agent_id: agentId,
        user_info: userInfo,
      },
      accessToken,
    });
  } catch (error) {
    console.error(error);
  }
  return response;
};

type MetadataEvent =
  | {
      type: "call_end";
      data: null;
    }
  | {
      type: "speaker";
      data: SpeakerSegment[];
    }
  | {
      type: "audio";
      data: string;
    };

export const listenInStream = async function* (
  phoneCallId: string,
  accessToken: string | null
) {
  for await (const payload of Ajax.stream<MetadataEvent>({
    url: `${baseUrl}/api/v1/phone/listen-in-stream/${phoneCallId}`,
    method: "GET",
    accessToken,
  })) {
    yield payload;
  }
};

export const hangUp = async (
  phoneCallId: string,
  accessToken: string | null
) => {
  let response = true;
  try {
    await Ajax.req({
      url: `${baseUrl}/api/v1/phone/hang-up/${phoneCallId}`,
      method: "POST",
      accessToken,
    });
  } catch (error) {
    response = false;
    console.error(error);
  }
  return response;
};

export const getCallHistory = async (accessToken: string | null) => {
  let response = null;
  try {
    response = await Ajax.req<PhoneCallMetadata[]>({
      url: `${baseUrl}/api/v1/phone/call-history`,
      method: "GET",
      accessToken,
    });
  } catch (error) {
    console.error(error);
  }
  return response;
};

export const getAudioPlayback = async (
  phoneCallId: string,
  accessToken: string | null
) => {
  let response = null;
  try {
    response = await Ajax.req<{
      speaker_segments: SpeakerSegment[];
      bar_heights: BarHeight[];
      total_duration: number;
      audio_data_b64: string;
      content_type: string;
    }>({
      url: `${baseUrl}/api/v1/phone/playback/${phoneCallId}`,
      method: "GET",
      accessToken,
    });
  } catch (error) {
    console.error(error);
  }
  return response;
};

export const getBrowserCallUrl = (phoneCallId: string) => {
  return `${baseUrl}/api/v1/browser/call-stream/${phoneCallId}`.replace(
    "http",
    "ws"
  );
};

export const getAgents = async (accessToken: string | null) => {
  let response = null;
  try {
    response = await Ajax.req<Agent[]>({
      url: `${baseUrl}/api/v1/agent/all`,
      method: "GET",
      accessToken,
    });
  } catch (error) {
    console.error(error);
  }
  return response;
};

export const createNewAgentVersion = async (
  agent: Agent,
  newFields: string[],
  accessToken: string | null
) => {
  let response = null;
  try {
    response = await Ajax.req<Agent>({
      url: `${baseUrl}/api/v1/agent/new-version`,
      method: "POST",
      body: {
        agent_base: {
          name: agent.name,
          system_message: agent.system_message,
          base_id: agent.base_id,
          active: agent.active,
          sample_values: agent.sample_values,
          incoming_phone_number: agent.incoming_phone_number,
        },
        new_fields: newFields,
      },
      accessToken,
    });
  } catch (error) {
    console.error(error);
  }
  return response;
};

export const createAgent = async (name: string, accessToken: string | null) => {
  let response = null;
  try {
    response = await Ajax.req<Agent>({
      url: `${baseUrl}/api/v1/agent/new-agent`,
      method: "POST",
      body: {
        name,
      },
      accessToken,
    });
  } catch (error) {
    console.error(error);
  }
  return response;
};

export const getSampleValues = async (
  fields: string[],
  accessToken: string | null
) => {
  let response = null;
  try {
    response = await Ajax.req<Record<string, string>>({
      url: `${baseUrl}/api/v1/agent/sample-values`,
      method: "POST",
      body: { fields },
      accessToken,
    });
  } catch (error) {
    console.error(error);
  }
  return response;
};

export const getAnalyticsGroups = async (accessToken: string | null) => {
  let response = null;
  try {
    response = await Ajax.req<AnalyticsGroup[]>({
      url: `${baseUrl}/api/v1/analytics/groups`,
      method: "GET",
      accessToken,
    });
  } catch (error) {
    console.error(error);
  }
  return response;
};
