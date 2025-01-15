import { BarHeight, PhoneCallMetadata, SpeakerSegment } from "@/types";
import Ajax from "./Ajax";

export let baseUrl = "";
if (import.meta.env.VITE_ENV === "prod") {
  baseUrl = "https://api.helixion.ai";
}

export const createSession = async (payload: Record<string, string>) => {
  let response = null;
  try {
    response = await Ajax.req<{
      id: string;
      value: string;
      expires_at: number;
    }>({
      url: `${baseUrl}/api/v1/browser/create-session`,
      method: "POST",
      body: payload,
    });
  } catch (error) {
    console.error(error);
  }
  return response;
};

export const storeSession = async (
  sessionId: string,
  data: Record<string, string>[],
  originalUserInfo: Record<string, string>
) => {
  let response = null;
  try {
    response = await Ajax.req<Record<string, string>>({
      url: `${baseUrl}/api/v1/browser/store-session`,
      method: "POST",
      body: {
        session_id: sessionId,
        data,
        original_user_info: originalUserInfo,
      },
    });
  } catch (error) {
    console.error(error);
  }
  return response;
};

export const outboundCall = async (
  phoneNumber: string,
  userInfo: Record<string, string>
) => {
  let response = null;
  try {
    response = await Ajax.req<{ phone_call_id: string }>({
      url: `${baseUrl}/api/v1/phone/outbound-call`,
      method: "POST",
      body: {
        phone_number: phoneNumber,
        user_info: userInfo,
      },
    });
  } catch (error) {
    console.error(error);
  }
  return response;
};

export const streamSpeakerSegments = async function* (phoneCallId: string) {
  for await (const payload of Ajax.stream<
    SpeakerSegment | { call_ended: boolean }
  >({
    url: `${baseUrl}/api/v1/phone/stream-speaker-segments/${phoneCallId}`,
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

export const getAudioStreamUrl = (phoneCallId: string) => {
  return `${baseUrl}/api/v1/phone/stream-audio/${phoneCallId}`;
};
