// 취재 레이더(Phase 3 액션층) — 온톨로지 개체(조직·사건·정책)별 최근 보도 커버리지 계산.
//   개체 별칭으로 아카이브 최근 언급일·총건수·최근1년 건수 집계 → 공백(오래 무보도)을 취재 후보로.
//   온톨로지를 편집 레이더로: "가로림만 조력발전 N개월째 무보도 → 후속취재?".

import type { D1Database } from "@cloudflare/workers-types";

export interface EntityCoverage {
  id: string; type: string; name: string; cat: string;
  lastMention: string | null; total: number; recent: number;
  gapDays: number | null; stale: boolean;
}

const DAY = 86400000;

/** 최근 언급일 → 공백일수·정체 여부(6개월↑ 무보도). 순수·테스트용. */
export function coverageStatus(lastMention: string | null, nowMs: number): { gapDays: number | null; stale: boolean } {
  if (!lastMention) return { gapDays: null, stale: true };
  const t = Date.parse(lastMention);
  if (Number.isNaN(t)) return { gapDays: null, stale: true };
  const gapDays = Math.max(0, Math.floor((nowMs - t) / DAY));
  return { gapDays, stale: gapDays >= 180 };
}

interface Node { id: string; type: string; name: string; aliases: string | null; attrs_json: string | null }

function catOf(attrs_json: string | null): string {
  try { const a = JSON.parse(attrs_json ?? "{}"); return typeof a.cat === "string" ? a.cat : typeof a.kind === "string" ? a.kind : ""; } catch { return ""; }
}

/** verified=1 조직·사건·정책의 아카이브 커버리지. nowIso=요청시각(테스트 주입). 정체 심한 순 정렬. */
export async function loadEntityCoverage(db: D1Database, nowIso: string): Promise<EntityCoverage[]> {
  const nres = await db
    .prepare(`SELECT id,type,name,aliases,attrs_json FROM kg_nodes WHERE type IN ('org','event','policy') AND verified=1`)
    .all<Node>();
  const nodes = nres.results ?? [];
  const nowMs = Date.parse(nowIso);
  const yearAgo = new Date(nowMs - 365 * DAY).toISOString();

  const out = await Promise.all(
    nodes.map(async (n) => {
      const terms = [n.name, ...(n.aliases ? n.aliases.split(",") : [])].map((t) => t.trim()).filter((t) => t.length >= 2).slice(0, 4);
      const uniq = [...new Set(terms)];
      const where = uniq.map((_, i) => `body LIKE ?${i + 2} OR title LIKE ?${i + 2}`).join(" OR ");
      const binds = [yearAgo, ...uniq.map((t) => `%${t}%`)];
      let lastMention: string | null = null, total = 0, recent = 0;
      try {
        const row = await db
          .prepare(`SELECT MAX(published_at) lm, COUNT(*) total, SUM(CASE WHEN published_at >= ?1 THEN 1 ELSE 0 END) recent FROM archive_articles WHERE ${where}`)
          .bind(...binds)
          .first<{ lm: string | null; total: number; recent: number }>();
        lastMention = row?.lm ?? null; total = row?.total ?? 0; recent = row?.recent ?? 0;
      } catch { /* 개체별 격리 */ }
      const { gapDays, stale } = coverageStatus(lastMention, nowMs);
      return { id: n.id, type: n.type, name: n.name, cat: catOf(n.attrs_json), lastMention, total, recent, gapDays, stale };
    }),
  );
  return out.sort((a, b) => (b.gapDays ?? 1e9) - (a.gapDays ?? 1e9));
}
