// 공개 인물 탐색(독자용, 읽기 전용) — /api/kg. 인증 없음.
//   기존 people.ts를 재사용하되 검색·프로필만 노출(수정 불가). 초허브·바이라인은 people.ts에서 제외됨.
//   ⚠️ 데이터는 AI 자동추출·미검증(verified=0). 관계 라벨은 프런트가 verified만 노출.
//   공개 여부는 app_settings.public_people 플래그로 superadmin이 즉시 토글(배포 불필요).
import { Hono } from "hono";
import type { Env } from "../types";
import { searchPersons, buildPersonProfile, buildPersonBrief, isBioSuppressed, isPersonHub } from "./people";
import { getSetting, SETTING_PUBLIC_PEOPLE } from "../settings";

export const kgPublicRouter = new Hono<{ Bindings: Env }>();

const isOn = (c: { env: Env }) => getSetting(c.env.ARCHIVE_DB, SETTING_PUBLIC_PEOPLE, "on").then((v) => v === "on");

// 전국 인물처럼 지역 AI 소개를 억제한 경우, 최소한의 정확·출처있는 소개로 한국어 위키백과 요약을 붙인다.
//   무료·키 불필요(REST summary API). 동음이의·미존재는 null. 라이선스(CC BY-SA) 준수 위해 프런트에서 출처·링크 표기.
export interface WikiSummary { extract: string; url: string; thumbnail?: string }
async function fetchWikiSummary(title: string): Promise<WikiSummary | null> {
  const ctrl = new AbortController();                       // AbortSignal.timeout은 이 런타임서 throw → AbortController+setTimeout로 대체
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(`https://ko.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}?redirect=true`, {
      headers: { "User-Agent": "TaeanInsightBot/1.0 (https://insight.taeannews.co.kr; taeannews@taeannews.co.kr)", Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { type?: string; extract?: string; content_urls?: { desktop?: { page?: string } }; thumbnail?: { source?: string } };
    if (j.type === "disambiguation" || !j.extract || j.extract.length < 20) return null;
    return {
      extract: j.extract,
      url: j.content_urls?.desktop?.page ?? `https://ko.wikipedia.org/wiki/${encodeURIComponent(title)}`,
      ...(j.thumbnail?.source ? { thumbnail: j.thumbnail.source } : {}),
    };
  } catch { return null; } finally { clearTimeout(timer); }
}

// 위키 요약·사진을 D1(wiki_cache)에 7일 TTL로 캐시. found=0도 캐시해 페이지 없는 인물의 재요청을 막는다.
async function getWikiCached(db: D1Database, name: string): Promise<{ found: boolean; summary: WikiSummary | null }> {
  const nm = (name || "").trim();
  if (!nm) return { found: false, summary: null };
  try {
    const row = await db.prepare("SELECT found, extract, url, thumbnail, checked_at FROM wiki_cache WHERE name=?").bind(nm)
      .first<{ found: number; extract: string | null; url: string | null; thumbnail: string | null; checked_at: string }>();
    if (row) {
      const ageMs = Date.now() - Date.parse(row.checked_at.replace(" ", "T") + "Z");
      if (!(ageMs > 7 * 864e5)) { // 7일 이내면 캐시 사용
        if (!row.found || !row.extract || !row.url) return { found: !!row.found, summary: null };
        return { found: true, summary: { extract: row.extract, url: row.url, ...(row.thumbnail ? { thumbnail: row.thumbnail } : {}) } };
      }
    }
  } catch { /* 캐시 조회 실패 → 신선 조회 */ }
  const w = await fetchWikiSummary(nm);
  try {
    await db.prepare("INSERT OR REPLACE INTO wiki_cache(name, found, extract, url, thumbnail, checked_at) VALUES(?,?,?,?,?,datetime('now'))")
      .bind(nm, w ? 1 : 0, w?.extract ?? null, w?.url ?? null, w?.thumbnail ?? null).run();
  } catch { /* 캐시 저장 실패 무시 */ }
  return { found: !!w, summary: w };
}

// 공개 여부(프런트 페이지·네비가 확인). 짧게 edge 캐시.
kgPublicRouter.get("/status", async (c) => {
  const enabled = await isOn(c);
  c.header("Cache-Control", "public, max-age=30, s-maxage=30");
  return c.json({ enabled });
});

// 인물 검색 — q≥2자. 상위 20. 비활성 시 빈 결과.
kgPublicRouter.get("/persons/search", async (c) => {
  if (!c.env.ARCHIVE_DB || !(await isOn(c))) return c.json({ results: [], disabled: true });
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 2) return c.json({ results: [] });
  return c.json({ results: await searchPersons(c.env.ARCHIVE_DB, q, 20) });
});

// 인물 프로필 — 관계망(바이라인 제외)·함께등장·나온 기사·시기별 등장·직위(verified).
kgPublicRouter.get("/person/:id/profile", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "no_db" }, 503);
  if (!(await isOn(c))) return c.json({ error: "disabled" }, 403);
  const prof = await buildPersonProfile(c.env.ARCHIVE_DB, c.req.param("id"), 12);
  if (!prof) return c.json({ error: "not_found" }, 404);
  // R2 공식 사진(군수·의원)이 없으면, 위키백과에 인물 사진이 있을 때 아바타로 사용(도지사·국회의원 등).
  //   단 초허브(바이라인)는 위키 오매칭 위험이 있어 위키 사진을 붙이지 않는다.
  if (!prof.photo && prof.person && !prof.person.isHub) {
    const w = await getWikiCached(c.env.ARCHIVE_DB, prof.person.name);
    if (w.summary?.thumbnail) prof.photo = w.summary.thumbnail; // 절대 URL(upload.wikimedia.org)
  }
  return c.json(prof);
});

// 인물 AI 전기(기사 근거 5~7문장, 미검증) — 프런트가 프로필 표시 후 지연 로드.
//   무료 Workers AI지만 일일 뉴런 한도·지연이 있어 kg_person_bio에 캐시. 단 '생성 시점 최신 기사 날짜'를
//   함께 저장해, 그 뒤 더 최신 기사가 들어오면 자동 재생성(무효화) → 오래된 브리핑 방지.
//   쿼리 경로 buildPersonBriefCard와 동일 함수·프롬프트(지어내기 방지) 재사용.
kgPublicRouter.get("/person/:id/brief", async (c) => {
  if (!c.env.ARCHIVE_DB) return c.json({ error: "no_db" }, 503);
  if (!(await isOn(c))) return c.json({ error: "disabled" }, 403);
  const id = c.req.param("id");
  const db = c.env.ARCHIVE_DB;
  // 초허브(바이라인=기자·편집인): 본인이 쓴 기사가 등장으로 잡혀 AI 소개가 기사 주제를 본인 행위로 오인 → 억제.
  if (await isPersonHub(db, id)) {
    c.header("Cache-Control", "public, max-age=86400");
    return c.json({ brief: null, suppressed: true, byline: true });
  }
  // 전국 인물 등 억제 대상: 로컬 AI 소개 대신 한국어 위키백과 요약을 붙여 준다(정확·출처있음). 없으면 안내만.
  if (await isBioSuppressed(db, id)) {
    const nameRow = await db.prepare("SELECT name FROM kg_nodes WHERE id=?").bind(id).first<{ name: string }>();
    const wiki = nameRow?.name ? (await getWikiCached(db, nameRow.name)).summary : null;
    c.header("Cache-Control", "public, max-age=86400");
    return c.json({ brief: null, suppressed: true, wiki });
  }
  const [cached, latestRow] = await Promise.all([
    db.prepare("SELECT bio, latest_article FROM kg_person_bio WHERE node_id=?").bind(id).first<{ bio: string; latest_article: string | null }>(),
    db.prepare("SELECT MAX(a.published_at) AS d FROM kg_mentions m JOIN archive_articles a ON a.idxno=m.article_idxno WHERE m.node_id=?").bind(id).first<{ d: string | null }>(),
  ]);
  const latest = latestRow?.d ?? null;
  // 캐시가 있고 그 이후 새 기사가 없으면(최신 기사 날짜 동일) 캐시 사용. 다르면(새 기사 유입) 재생성.
  if (cached?.bio && cached.latest_article === latest) {
    c.header("Cache-Control", "public, max-age=300");
    return c.json({ brief: cached.bio, cached: true });
  }
  if (!c.env.AI) { c.header("Cache-Control", "public, max-age=300"); return c.json({ brief: cached?.bio ?? null, cached: !!cached?.bio }); }
  const brief = await buildPersonBrief(db, c.env.AI, id);
  if (brief) {
    try { await db.prepare("INSERT OR REPLACE INTO kg_person_bio(node_id, bio, latest_article) VALUES(?, ?, ?)").bind(id, brief, latest).run(); } catch { /* 캐시 실패는 무시 */ }
  }
  c.header("Cache-Control", "public, max-age=300");
  return c.json({ brief: brief ?? cached?.bio ?? null, cached: false });
});
