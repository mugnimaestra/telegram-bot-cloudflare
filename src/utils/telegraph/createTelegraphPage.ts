import type { Node } from "@/types/telegraph";

interface TelegraphPageResponse {
  ok: boolean;
  result: {
    url: string;
    path: string;
    title: string;
    description: string;
    author_name: string;
    content: Node[];
    views: number;
    can_edit: boolean;
  };
}

export async function createTelegraphPage(
  accessToken: string,
  title: string,
  content: Node[]
): Promise<{ url: string }> {
  const response = await fetch("https://api.telegra.ph/createPage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      access_token: accessToken,
      title,
      content: JSON.stringify(content),
      return_content: false,
    }),
  });

  const data = (await response.json()) as TelegraphPageResponse;
  if (!data.ok) {
    throw new Error("Failed to create Telegraph page");
  }

  return { url: data.result.url };
}
