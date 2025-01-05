import { fetcher } from "@/utils/fetcher";

export interface EditMessageTextParams {
  chat_id: number;
  message_id: number;
  text: string;
  parse_mode?: string;
  reply_markup?: any;
}

export interface EditMessageTextResponse {
  ok: boolean;
}

export async function editMessageText(
  params: EditMessageTextParams,
  token: string
): Promise<EditMessageTextResponse> {
  return fetcher<EditMessageTextResponse>({
    method: "POST",
    url: `/bot${token}/editMessageText`,
    baseUrl: "https://api.telegram.org",
    body: params,
  });
}
