import type { TelegraphAccount } from "@/types/telegraph";

let telegraphAccountCache: TelegraphAccount | null = null;

interface TelegraphResponse {
  ok: boolean;
  result: TelegraphAccount;
}

export async function getOrCreateTelegraphAccount(): Promise<TelegraphAccount> {
  if (telegraphAccountCache) {
    return telegraphAccountCache;
  }

  const response = await fetch("https://api.telegra.ph/createAccount", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      short_name: "NH Bot",
      author_name: "NH Bot",
    }),
  });

  const data = (await response.json()) as TelegraphResponse;
  if (!data.ok) {
    throw new Error("Failed to create Telegraph account");
  }

  telegraphAccountCache = data.result;
  return data.result;
}
