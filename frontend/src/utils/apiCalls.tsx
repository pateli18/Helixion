import {
  Agent,
  AnalyticsGroup,
  BarHeight,
  PhoneCallMetadata,
  SpeakerSegment,
  KnowledgeBase,
  DocumentMetadata,
  AgentPhoneNumber,
  AgentMetadata,
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

export const getAgentMetadata = async (accessToken: string | null) => {
  let response = null;
  try {
    response = await Ajax.req<AgentMetadata[]>({
      url: `${baseUrl}/api/v1/agent/metadata/all`,
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
          tool_configuration: agent.tool_configuration,
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

export const updateInstructionsFromReport = async (
  agentId: string,
  reportId: string,
  accessToken: string | null
) => {
  let response = null;
  try {
    response = await Ajax.req<{
      base_id: string;
      version_id: string;
    }>({
      url: `${baseUrl}/api/v1/agent/update-instructions-from-report/${agentId}/${reportId}`,
      method: "POST",
      accessToken,
    });
  } catch (error) {
    console.error(error);
  }
  return response;
};

export const activateAgentVersion = async (
  versionId: string,
  accessToken: string | null
) => {
  let response = false;
  try {
    await Ajax.req({
      url: `${baseUrl}/api/v1/agent/activate-version/${versionId}`,
      method: "POST",
      accessToken,
    });
    response = true;
  } catch (error) {
    console.error(error);
  }
  return response;
};

export const updateToolConfiguration = async (
  agentId: string,
  hangUp: boolean,
  sendText: boolean,
  transferCallNumbers: { phone_number: string; label: string }[],
  enterKeypad: boolean,
  knowledgeBases: { id: string; name: string }[],
  accessToken: string | null
) => {
  let response = null;
  try {
    response = await Ajax.req<Record<string, any>>({
      url: `${baseUrl}/api/v1/agent/update-tool-configuration/${agentId}`,
      method: "POST",
      body: {
        hang_up: hangUp,
        send_text: sendText,
        transfer_call_numbers: transferCallNumbers,
        enter_keypad: enterKeypad,
        knowledge_bases: knowledgeBases,
      },
      accessToken,
    });
  } catch (error) {
    console.error(error);
  }
  return response;
};

export const getAllKnowledgeBases = async (accessToken: string | null) => {
  let response = null;
  try {
    response = await Ajax.req<KnowledgeBase[]>({
      url: `${baseUrl}/api/v1/knowledge-base/all`,
      method: "GET",
      accessToken,
    });
  } catch (error) {
    console.error(error);
  }
  return response;
};

export const uploadDocuments = async (
  files: FileList,
  knowledgeBaseId: string,
  accessToken: string | null
) => {
  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append("files", files[i]);
  }

  let response = null;
  try {
    response = await Ajax.req<DocumentMetadata[]>({
      url: `${baseUrl}/api/v1/knowledge-base/upload/${knowledgeBaseId}`,
      method: "POST",
      body: formData,
      accessToken,
    });
  } catch (error) {
    console.error(error);
  }
  return response;
};

export const createKnowledgeBase = async (
  name: string,
  accessToken: string | null
) => {
  let response = null;
  try {
    response = await Ajax.req<KnowledgeBase>({
      url: `${baseUrl}/api/v1/knowledge-base/create`,
      method: "POST",
      body: { name },
      accessToken,
    });
  } catch (error) {
    console.error(error);
  }
  return response;
};

export const getAvailablePhoneNumbers = async (
  countryCode: string,
  areaCode: string,
  accessToken: string | null
) => {
  let response = null;
  try {
    response = await Ajax.req<string[]>({
      url: `${baseUrl}/api/v1/agent/phone-number/available/${countryCode}/${areaCode}`,
      method: "GET",
      accessToken,
    });
  } catch (error) {
    console.error(error);
  }
  return response;
};

export const buyPhoneNumber = async (
  phoneNumber: string,
  accessToken: string | null
) => {
  let response = null;
  try {
    response = await Ajax.req<AgentPhoneNumber>({
      url: `${baseUrl}/api/v1/agent/phone-number/buy`,
      method: "POST",
      body: { phone_number: phoneNumber },
      accessToken,
    });
  } catch (error) {
    console.error(error);
  }
  return response;
};

export const assignPhoneNumberToAgent = async (
  phoneNumberId: string,
  agentBaseId: string,
  incoming: boolean,
  accessToken: string | null
) => {
  let response = true;
  try {
    await Ajax.req({
      url: `${baseUrl}/api/v1/agent/phone-number/assign`,
      method: "POST",
      body: {
        phone_number_id: phoneNumberId,
        agent_base_id: agentBaseId,
        incoming,
      },
      accessToken,
    });
  } catch (error) {
    response = false;
    console.error(error);
  }
  return response;
};

export const getAllPhoneNumbers = async (accessToken: string | null) => {
  let response = null;
  try {
    response = await Ajax.req<AgentPhoneNumber[]>({
      url: `${baseUrl}/api/v1/agent/phone-number/all`,
      method: "GET",
      accessToken,
    });
  } catch (error) {
    console.error(error);
  }
  return response;
};

export const getIncomingAvailablePhoneNumbers = async (
  existingPhoneNumberIds: string[],
  accessToken: string | null
) => {
  let response = null;
  try {
    const idsQueryParam = existingPhoneNumberIds
      .map((id) => `existing_phone_number_ids=${id}`)
      .join("&");
    response = await Ajax.req<AgentPhoneNumber[]>({
      url: `${baseUrl}/api/v1/agent/phone-number/incoming-available?${idsQueryParam}`,
      method: "GET",
      accessToken,
    });
  } catch (error) {
    console.error(error);
  }
  return response;
};

export const assignMultiplePhoneNumbersToAgent = async (
  phoneNumbers: AgentPhoneNumber[],
  agentBaseId: string,
  accessToken: string | null
) => {
  let response = true;
  try {
    await Ajax.req({
      url: `${baseUrl}/api/v1/agent/phone-number/update-assigned`,
      method: "POST",
      body: {
        phone_numbers: phoneNumbers,
        agent_base_id: agentBaseId,
      },
      accessToken,
    });
  } catch (error) {
    response = false;
    console.error(error);
  }
  return response;
};
