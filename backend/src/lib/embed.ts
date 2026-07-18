// bge-m3(1024d) 텍스트 임베딩 — Workers AI 무료. 실패 시 null. 질의·기사 임베딩 공용.
import type { Env } from "../types";

export async function embedText(env: Env, text: string): Promise<number[] | null> {
  if (!env.AI) return null;
  try {
    const r = (await env.AI.run("@cf/baai/bge-m3", { text: [text.slice(0, 1500)] })) as { data?: number[][] };
    return r.data?.[0] ?? null;
  } catch {
    return null;
  }
}
