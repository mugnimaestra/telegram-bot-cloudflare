export interface SendDocumentParams {
  chat_id: string;
  document: Blob;
  filename: string;
  caption?: string;
  message_thread_id?: string;
}

export interface SendDocumentResponse {
  ok: boolean;
}

export async function sendDocument(
  params: SendDocumentParams,
  token: string
): Promise<SendDocumentResponse> {
  const formData = new FormData();
  formData.append("document", params.document, params.filename);
  formData.append("chat_id", params.chat_id);

  if (params.caption) {
    formData.append("caption", params.caption);
  }

  if (params.message_thread_id) {
    formData.append("message_thread_id", params.message_thread_id);
  }

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendDocument`,
    {
      method: "POST",
      body: formData,
    }
  );

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}
