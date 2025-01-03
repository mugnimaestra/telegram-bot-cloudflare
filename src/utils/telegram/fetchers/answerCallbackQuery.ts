import { fetcher } from "@/utils/fetcher";

export interface AnswerCallbackQueryParams {
  callback_query_id: string;
  text?: string;
  show_alert?: boolean;
}

export interface AnswerCallbackQueryResponse {
  ok: boolean;
}

export async function answerCallbackQuery(
  params: AnswerCallbackQueryParams,
  token: string
): Promise<AnswerCallbackQueryResponse> {
  return fetcher<AnswerCallbackQueryResponse>({
    method: "POST",
    url: `/bot${token}/answerCallbackQuery`,
    baseUrl: "https://api.telegram.org",
    body: params,
  });
}
