import Ajax from "./Ajax";

export let baseUrl = "";
if (import.meta.env.VITE_ENV === "prod") {
  baseUrl = "https://clinicontact.onrender.com";
}

export const createSession = async (payload: Record<string, string>) => {
  let response = null;
  try {
    response = await Ajax.req<{
      id: string;
      value: string;
      expires_at: number;
    }>({
      url: `${baseUrl}/api/v1/create-session`,
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
      url: `${baseUrl}/api/v1/store-session`,
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
