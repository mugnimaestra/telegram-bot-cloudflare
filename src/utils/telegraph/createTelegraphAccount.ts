import type { TelegraphAccount } from "@/types/telegraph";

export async function createTelegraphAccount(): Promise<TelegraphAccount> {
  const response = await fetch("https://api.telegra.ph/createAccount", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      short_name: "UMP9Bot",
      author_name: "UMP9",
      author_url: "https://t.me/your_bot_username",
    }),
  });

  const data = (await response.json()) as {
    ok: boolean;
    result?: TelegraphAccount;
  };
  if (!data.ok || !data.result) {
    throw new Error("Failed to create Telegraph account");
  }

  return data.result;
}
