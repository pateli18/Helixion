import { Agent, BarHeight, PhoneCallMetadata, SpeakerSegment } from "@/types";
import Ajax from "./Ajax";

export let baseUrl = "";
if (import.meta.env.VITE_ENV === "prod") {
  baseUrl = "https://api.helixion.ai";
}

export const outboundCall = async (
  phoneNumber: string,
  agentId: string,
  userInfo: Record<string, string>
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
    });
  } catch (error) {
    console.error(error);
  }
  return response;
};

export const browserCall = async (
  agentId: string,
  userInfo: Record<string, string>
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

export const listenInStream = async function* (phoneCallId: string) {
  for await (const payload of Ajax.stream<MetadataEvent>({
    url: `${baseUrl}/api/v1/phone/listen-in-stream/${phoneCallId}`,
    method: "GET",
  })) {
    yield payload;
  }
};

export const hangUp = async (phoneCallId: string) => {
  let response = true;
  try {
    await Ajax.req({
      url: `${baseUrl}/api/v1/phone/hang-up/${phoneCallId}`,
      method: "POST",
    });
  } catch (error) {
    response = false;
    console.error(error);
  }
  return response;
};

export const getCallHistory = async () => {
  let response = null;
  try {
    response = await Ajax.req<PhoneCallMetadata[]>({
      url: `${baseUrl}/api/v1/phone/call-history`,
      method: "GET",
    });
  } catch (error) {
    console.error(error);
  }
  return response;
};

export const getAudioTranscript = async (phoneCallId: string) => {
  let response = null;
  try {
    response = await Ajax.req<{
      speaker_segments: SpeakerSegment[];
      bar_heights: BarHeight[];
      total_duration: number;
    }>({
      url: `${baseUrl}/api/v1/phone/audio-transcript/${phoneCallId}`,
      method: "GET",
    });
  } catch (error) {
    console.error(error);
  }
  return response;
};

export const getPlayAudioUrl = (phoneCallId: string) => {
  return `${baseUrl}/api/v1/phone/play-audio/${phoneCallId}`;
};

export const getBrowserCallUrl = (phoneCallId: string) => {
  return `${baseUrl}/api/v1/browser/call-stream/${phoneCallId}`.replace(
    "http",
    "ws"
  );
};

export const getAgents = async () => {
  let response = null;
  try {
    response = await Ajax.req<Agent[]>({
      url: `${baseUrl}/api/v1/agent/all`,
      method: "GET",
    });
  } catch (error) {
    console.error(error);
  }
  return response;
};

export const createNewAgentVersion = async (
  name: string,
  systemMessage: string,
  baseId: string,
  active: boolean
) => {
  let response = null;
  try {
    response = await Ajax.req<Agent>({
      url: `${baseUrl}/api/v1/agent/new-version`,
      method: "POST",
      body: {
        name,
        system_message: systemMessage,
        base_id: baseId,
        active,
      },
    });
  } catch (error) {
    console.error(error);
  }
  return response;
};

export const createAgent = async (name: string) => {
  let response = null;
  try {
    response = await Ajax.req<Agent>({
      url: `${baseUrl}/api/v1/agent/new-agent`,
      method: "POST",
      body: {
        name,
      },
    });
  } catch (error) {
    console.error(error);
  }
  return response;
};
