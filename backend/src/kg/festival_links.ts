// 승격 축제 자동연결(Phase 3 후속) — 축제 event가 verified=1로 승격될 때, 이름에 근거해
//   개최지(held_at)·관련 품목(relates)·주관(hosts)을 자동 연결. 지어내기 방지: 이름에 명시된 것만.
//   개최지·품목=이름에 장소/품목명이 박혀 있을 때만(사실). 주관=태안-브랜드 축제만 태안군청(합리적 기본).

import type { D1Database } from "@cloudflare/workers-types";

// 장소/품목 토큰 → 기존 노드 id(migration 049 시드).
const PLACE_TOKENS: [string, string][] = [
  ["백사장", "place:beach-baeksajang"], ["만리포", "place:beach-mallipo"], ["몽산포", "place:beach-mongsanpo"],
  ["꽃지", "place:beach-kkotji"], ["신두리", "place:beach-sinduri"], ["천리포", "place:cheollipo"],
  ["코리아플라워", "place:koreaflowerpark"], ["네덜란드", "place:koreaflowerpark"], ["안면", "place:anmyeondo"],
];
const COMMODITY_TOKENS: [string, string][] = [
  ["대하", "commodity:daeha"], ["꽃게", "commodity:kkotge"], ["주꾸미", "commodity:jukkumi"], ["바지락", "commodity:bajirak"],
  ["낙지", "commodity:nakji"], ["우럭", "commodity:ureok"], ["오징어", "commodity:ojingeo"], ["갈치", "commodity:galchi"],
  ["전복", "commodity:jeonbok"], ["마늘", "commodity:maneul"], ["생강", "commodity:saenggang"], ["감자", "commodity:gamja"],
  ["고추", "commodity:gochu"], ["양파", "commodity:yangpa"],
];

export interface FestivalLinks { host: string | null; place: string | null; commodity: string | null }

/** 축제명에 명시된 개최지·품목·주관 추론(순수·테스트용). */
export function inferFestivalLinks(name: string): FestivalLinks {
  const n = name || "";
  const place = PLACE_TOKENS.find(([t]) => n.includes(t))?.[1] ?? null;
  const commodity = COMMODITY_TOKENS.find(([t]) => n.includes(t))?.[1] ?? null;
  const host = n.includes("태안") ? "org:taean-gov" : null; // 태안-브랜드 축제만 군청 주관(합리적 기본)
  return { host, place, commodity };
}

const NOW = "2026-08-08T00:00:00Z";
// 같은 (src,rel,dst)가 이미 있으면 건너뜀(시드 관계와 중복 방지). 추가했으면 true.
async function addEdge(db: D1Database, id: string, src: string, rel: string, dst: string): Promise<boolean> {
  const exists = await db.prepare(`SELECT 1 FROM kg_edges WHERE src_id=? AND rel=? AND dst_id=? LIMIT 1`).bind(src, rel, dst).first();
  if (exists) return false;
  await db
    .prepare(`INSERT OR IGNORE INTO kg_edges(id,src_id,rel,dst_id,attrs_json,source,verified,schema_ver,created_at,updated_at) VALUES (?,?,?,?,NULL,'자동연결·축제명',1,1,?,?)`)
    .bind(id, src, rel, dst, NOW, NOW).run();
  return true;
}

/** 축제 event(verified) 승격 시 이름 기반 관계 자동 추가. event가 아니면 no-op. 추가한 관계 수 반환. */
export async function autoConnectFestival(db: D1Database, eventId: string): Promise<number> {
  const node = await db.prepare(`SELECT id,type,name,verified FROM kg_nodes WHERE id=?`).bind(eventId).first<{ id: string; type: string; name: string; verified: number }>();
  if (!node || node.type !== "event" || node.verified !== 1) return 0;
  const { host, place, commodity } = inferFestivalLinks(node.name);
  const slug = eventId.replace(/[^a-zA-Z0-9가-힣]/g, "").slice(0, 40);
  let added = 0;
  if (host && (await addEdge(db, `e:hosts:auto:${slug}`, host, "hosts", eventId))) added++;
  if (place && (await addEdge(db, `e:heldat:auto:${slug}`, eventId, "held_at", place))) added++;
  if (commodity && (await addEdge(db, `e:relates:auto:${slug}`, eventId, "relates", commodity))) added++;
  return added;
}
