// 공개 인물 탐색(독자용, 읽기 전용) — /api/kg. 인증 없음.
//   기존 people.ts를 재사용하되 검색·프로필만 노출(수정 불가). 초허브·바이라인은 people.ts에서 제외됨.
//   ⚠️ 데이터는 AI 자동추출·미검증(verified=0). 관계 라벨은 프런트가 verified만 노출.
//   공개 여부는 app_settings.public_people 플래그로 superadmin이 즉시 토글(배포 불필요).
import { Hono } from "hono";
import type { Env } from "../types";
import { searchPersons, buildPersonProfile, buildPersonBrief, isBioSuppressed } from "./people";
import { getSetting, SETTING_PUBLIC_PEOPLE } from "../settings";

export const kgPublicRouter = new Hono<{ Bindings: Env }>();

const isOn = (c: { env: Env }) => getSetting(c.env.ARCHIVE_DB, SETTING_PUBLIC_PEOPLE, "on").then((v) => v === "on");

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
  // 전국 인물 등 억제 대상은 AI 소개를 만들지도 서빙하지도 않음(팩트·관계망만). 프런트가 이 플래그로 섹션 숨김.
  if (await isBioSuppressed(db, id)) { c.header("Cache-Control", "public, max-age=300"); return c.json({ brief: null, suppressed: true }); }
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
