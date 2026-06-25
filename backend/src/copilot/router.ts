// 시민 코파일럿 API — 작성 중 실시간 거버넌스 점검 + 제출→HITL 검수 큐.
// 안전·점검 레이어는 무LLM(규칙/검색)으로 동작. 글쓰기 보조(다듬기/요약)는 추후 Workers AI/Claude.
// 기존 자산 재사용: governance(pii·sensitive·ai_label·middleware) + review_queue(HITL).
// TaskMaster #25(코파일럿) / #26(HITL) / #27(거버넌스)

import { Hono } from "hono";
import { z } from "zod";

import type { Env } from "../types";
import { fetchConditions } from "../env/sources";
import { detectPii } from "../governance/pii";
import { classifySensitiveTopics } from "../governance/sensitive_topics";
import { applyGovernance } from "../governance/middleware";
import { AI_LABEL_TEXT, type AiLabel } from "../governance/ai_label";
import { reviewService, nextReviewId, type ReviewItem } from "../governance/review_queue";

export const copilotRouter = new Hono<{ Bindings: Env }>();

// ── 실시간 점검 (무LLM) — 입력하면 PII·민감주제 경고 ────────
copilotRouter.post("/check", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const text = typeof body?.text === "string" ? body.text : "";
  const title = typeof body?.title === "string" ? body.title : "";
  const full = `${title}\n${text}`;

  const pii = detectPii(full);
  const sensitive = classifySensitiveTopics(full);

  return c.json({
    chars: text.length,
    pii: {
      count: pii.findings.length,
      kinds: [...new Set(pii.findings.map((f) => f.kind))],
      maskedPreview: pii.findings.length ? pii.masked.slice(0, 240) : null,
      // 감지된 실제 문구(중복 제거, 종류별) — 본문에서 찾아 수정하도록 안내. 본문은 이미 작성자 소유.
      samples: [...new Map(pii.findings.map((f) => [f.matched, { kind: f.kind, matched: f.matched }])).values()].slice(0, 12),
    },
    sensitive: {
      topics: sensitive.topics.map((t) => ({ topic: t.topic, matched: t.matchedKeywords })),
      requiresHitl: sensitive.requiresHitl,
      blockAiOnly: sensitive.blockAiOnly,
    },
    // 즉시 보여줄 경고 문구
    warnings: [
      ...pii.findings.length ? [`개인정보 ${pii.findings.length}건 감지 — 발행 시 자동 마스킹됩니다`] : [],
      ...sensitive.blockAiOnly ? ["민감 주제 — AI 단독 발행 차단(편집장 직접 작성 필요)"] : [],
      ...sensitive.requiresHitl && !sensitive.blockAiOnly ? ["민감 주제 — 편집부 검토(HITL) 필수"] : [],
    ],
  });
});

// ── AI 글쓰기 보조 (Workers AI 오픈모델 — 무료 할당 내 종량 0) ──
// llama-3.1-8b-instruct는 2026-05-30 폐기 → 현행 고속 모델로 교체
const ASSIST_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const ASSIST_PROMPTS: Record<string, string> = {
  polish: "다음 한국어 기사 문장을 사실은 바꾸지 말고 자연스럽고 명확하게 다듬어줘. 결과만 출력해.",
  summarize: "다음 한국어 기사를 핵심 3줄로 요약해줘. 불릿으로.",
  title: "다음 한국어 기사에 어울리는 신문 제목 3개를 제안해줘. 각 줄에 하나씩.",
  // 사실 점검 보조 — 본문에서 검증 대상만 뽑아 체크리스트로. 새 사실 창작 금지(HITL·정확성 원칙).
  factcheck:
    "다음 한국어 기사 초안에서 발행 전 사실 확인이 필요한 항목(수치·통계·날짜·시각·고유명사·기관명·직책·인용)을 뽑아라. " +
    "본문에 실제로 있는 것만 추출하고 새로운 사실을 지어내지 마라. " +
    "각 항목을 '- [ ] 항목 — 확인처(예: 태안군 보도자료/담당부서/현장)' 형식의 체크리스트로만 출력해. 항목이 없으면 '확인할 항목 없음'이라고만 답해.",
};

copilotRouter.post("/assist", async (c) => {
  if (!c.env.AI) return c.json({ error: "ai_unbound", message: "Workers AI 바인딩이 없습니다" }, 503);
  const body = await c.req.json().catch(() => ({}));
  const mode = typeof body?.mode === "string" ? body.mode : "";
  const text = typeof body?.text === "string" ? body.text : "";
  const system = ASSIST_PROMPTS[mode];
  if (!system) return c.json({ error: "invalid_mode" }, 400);
  if (!text.trim()) return c.json({ error: "empty_text" }, 400);

  try {
    const res = (await c.env.AI.run(ASSIST_MODEL as never, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: text.slice(0, 4000) },
      ],
      max_tokens: 512,
    } as never)) as { response?: string };
    return c.json({ mode, model: ASSIST_MODEL, result: (res.response ?? "").trim() });
  } catch (e) {
    return c.json({ error: "assist_failed", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// ── 키워드 → 기사 초안 생성 (Workers AI) — 시민기자가 수정하는 출발점 ──
// 뉴스 날조 방지: 구체 사실(수치·날짜·이름·인용)은 지어내지 말고 [확인 필요] 마커로.
const DRAFT_SYSTEM = `너는 충남 태안 지역신문의 기사 초안 보조작가다. 기자가 준 키워드로 한국어 기사 '초안 골격'을 쓴다.
엄격한 규칙:
- 반드시 한국어만 사용한다(외국어·한자 혼용 금지).
- 절대 사실을 지어내지 마라: 수치·날짜·인명·기관명·통계는 모르면 [확인 필요: 무엇] 자리표시로 남긴다.
- 인용(따옴표)은 절대 창작하지 마라. "관계자는 …라고 말했다" 같은 가짜 발언 금지. 인용이 필요하면 [관계자 인용 확인 필요]로만 표기한다.
- 확인되지 않은 내용을 단정하지 말고, 취재로 채울 부분을 자리표시로 비워둔다.
- 신문체(객관적·간결)로 제목 1개 + 본문(리드 1문단 + 3~4문단 골격)을 쓴다.
- 출력 형식: 첫 줄에 제목만, 그다음 빈 줄, 그다음 본문. 설명·머리말 없이 기사만 출력한다.`;

copilotRouter.post("/draft", async (c) => {
  if (!c.env.AI) return c.json({ error: "ai_unbound" }, 503);
  const body = await c.req.json().catch(() => ({}));
  const keywords = typeof body?.keywords === "string" ? body.keywords.trim() : "";
  if (!keywords) return c.json({ error: "empty_keywords" }, 400);

  try {
    const res = (await c.env.AI.run(ASSIST_MODEL as never, {
      messages: [
        { role: "system", content: DRAFT_SYSTEM },
        { role: "user", content: `키워드: ${keywords.slice(0, 500)}` },
      ],
      max_tokens: 900,
    } as never)) as { response?: string };
    const text = (res.response ?? "").trim();
    const lines = text.split("\n");
    let titleLine = (lines.shift() ?? "").replace(/^제목[:：]\s*/, "").replace(/^#+\s*/, "").trim();
    if (titleLine.length > 100) { lines.unshift(titleLine); titleLine = ""; }
    const draftBody = lines.join("\n").trim();
    return c.json({ ok: true, model: ASSIST_MODEL, title: titleLine, body: draftBody || text });
  } catch (e) {
    return c.json({ error: "draft_failed", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// ── 관련 과거기사 (아카이브 RAG) — 작성 중 주제로 태안신문 과거 보도 검색 ──
// 무LLM(FTS5 트라이그램·BM25). 시민기자가 맥락·중복·후속취재 포인트를 잡도록 돕는다.
// 제목 가중(2회) + 본문 앞부분에서 3글자↑ 키워드 추출 → MATCH OR.
const RELATED_STOP = new Set([
  "태안", "태안군", "안면도", "기자", "오늘", "지금", "이번", "관련", "그리고", "위해", "통해",
  "있다", "했다", "한다", "한다고", "밝혔다", "대한", "대해", "위한", "에서", "으로",
]);
copilotRouter.post("/related", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ items: [] });
  const body = await c.req.json().catch(() => ({}));
  const title = typeof body?.title === "string" ? body.title : "";
  const text = typeof body?.text === "string" ? body.text : "";

  const src = `${title} ${title} ${text.slice(0, 600)}`; // 제목 2회 가중
  const tokens = [
    ...new Set(
      src.replace(/[^가-힣0-9a-zA-Z]/g, " ").split(/\s+/).filter((t) => t.length >= 3 && !RELATED_STOP.has(t)),
    ),
  ].slice(0, 8);
  if (!tokens.length) return c.json({ items: [] });

  const match = tokens.map((t) => `"${t.replace(/"/g, "")}"`).join(" OR ");
  try {
    const r = await db
      .prepare(
        `SELECT a.idxno, a.title, a.published_at, a.excerpt, a.category FROM archive_fts f ` +
          `JOIN archive_articles a ON a.idxno=f.rowid WHERE archive_fts MATCH ? ORDER BY bm25(archive_fts) LIMIT 5`,
      )
      .bind(match)
      .all<{ idxno: number; title: string; published_at: string; excerpt: string | null; category: string | null }>();
    const items = (r.results ?? []).map((it) => ({
      idxno: it.idxno,
      title: it.title,
      publishedAt: it.published_at,
      excerpt: it.excerpt ?? "",
      category: it.category ?? "",
    }));
    return c.json({ items });
  } catch (e) {
    return c.json({ items: [], error: e instanceof Error ? e.message : String(e) });
  }
});

// ── 실시간 데이터 블록 (날씨·물때·해넘이) — 본문에 끼워넣을 출처 표기 텍스트 ──
// 태안 지역기사(개장·축제·갯벌·바다)에 필요한 사실을 공공데이터로 채운다. 미리보기 호환 위해 표 대신 한 줄 텍스트.
copilotRouter.get("/context-data", async (c) => {
  const [cond, marine] = await Promise.all([
    fetchConditions(c.env).catch(() => null),
    import("../tour/marine").then((m) => m.loadMarine(c.env)).catch(() => null),
  ]);

  const k = new Date(Date.now() + 9 * 3600 * 1000);
  const md = `${k.getUTCMonth() + 1}/${k.getUTCDate()}`;
  const hhmm = (iso: string | null) => (iso && iso.length >= 16 ? iso.slice(11, 16) : "");
  const blocks: { id: string; label: string; markdown: string }[] = [];

  if (cond?.available) {
    const w = cond.weather, air = cond.air;
    const parts: string[] = [];
    if (w.temp != null) parts.push(`기온 ${w.temp}℃`);
    if (w.sky) parts.push(w.sky);
    if (w.pty && w.pty !== "없음") parts.push(w.pty);
    if (w.humidity != null) parts.push(`습도 ${w.humidity}%`);
    if (air.pm10 != null) parts.push(`미세먼지${air.grade ? ` ${air.grade}` : ""}(PM10 ${air.pm10}㎍/㎥)`);
    if (parts.length) {
      const at = hhmm(cond.observedAt);
      blocks.push({
        id: "weather",
        label: "날씨·대기질",
        markdown: `[태안 날씨 · ${md}${at ? ` ${at}` : ""} 기준] ${parts.join(", ")}. (출처: 기상청·에어코리아)`,
      });
    }
  }

  if (marine?.tide?.events?.length) {
    const hi = marine.tide.events.filter((e) => e.type === "고조").map((e) => `${e.time}${e.level != null ? `(${e.level}cm)` : ""}`);
    const lo = marine.tide.events.filter((e) => e.type === "저조").map((e) => `${e.time}${e.level != null ? `(${e.level}cm)` : ""}`);
    const seg: string[] = [];
    if (hi.length) seg.push(`만조 ${hi.join("·")}`);
    if (lo.length) seg.push(`간조 ${lo.join("·")}`);
    if (seg.length) {
      blocks.push({
        id: "tide",
        label: "물때(밀물·썰물)",
        markdown: `[물때 · ${marine.tide.station} ${md}] ${seg.join(", ")}. (출처: 국립해양조사원)`,
      });
    }
  }

  if (marine?.sun?.sunrise && marine.sun.sunset) {
    blocks.push({
      id: "sun",
      label: "해돋이·해넘이",
      markdown: `[해돋이·해넘이 · ${md}] 일출 ${marine.sun.sunrise}, 일몰 ${marine.sun.sunset}. (출처: 천문계산)`,
    });
  }

  return c.json({ available: blocks.length > 0, blocks });
});

// ── 이미지 업로드 → R2 (시민기자 기사 사진). 서빙은 /api/archive/photo/<key> ──
// PoC: 무인증(에디터와 동일). 타입·용량 가드만. 운영 시 reporter 인증 추가.
copilotRouter.post("/upload", async (c) => {
  if (!c.env.ARCHIVE_PHOTOS) return c.json({ error: "photos_unbound" }, 503);
  const ct = c.req.header("content-type") || "";
  if (!ct.startsWith("image/")) return c.json({ error: "invalid_type", message: "이미지 파일만 업로드할 수 있습니다" }, 400);
  const buf = await c.req.arrayBuffer();
  if (buf.byteLength > 10 * 1024 * 1024) return c.json({ error: "too_large", message: "10MB 이하만 가능합니다" }, 413);
  if (buf.byteLength < 64) return c.json({ error: "empty" }, 400);
  const ext = (ct.split("/")[1] || "jpg").replace("jpeg", "jpg").replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
  const key = `citizen/${crypto.randomUUID()}.${ext}`;
  await c.env.ARCHIVE_PHOTOS.put(key, buf, { httpMetadata: { contentType: ct } });
  const origin = new URL(c.req.url).origin;
  return c.json({ ok: true, key, url: `${origin}/api/archive/photo/${key}` });
});

// ── 제출 → 거버넌스 적용 → AI 라벨 산정 → 검수 큐 등록 ───────
const submitSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  aiLabel: z.enum(["human", "ai_assisted", "ai_generated"]),
  sources: z.array(z.object({ title: z.string(), url: z.string().optional() })).optional(),
  reporterId: z.string().optional(),
});

copilotRouter.post("/submit", async (c) => {
  const parsed = submitSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: "invalid_input", detail: parsed.error.format() }, 400);
  }
  const { title, body, aiLabel, sources, reporterId } = parsed.data;

  const gov = applyGovernance({ body, aiLabel: aiLabel as AiLabel, sources: sources ?? [] });

  const item: ReviewItem = {
    id: nextReviewId(),
    resourceType: "article",
    resourceId: reporterId ? `citizen:${reporterId}` : "citizen:anon",
    title,
    excerpt: gov.body.length > 160 ? gov.body.slice(0, 160) + "…" : gov.body,
    aiLabel: gov.forcedAiLabel,
    sensitiveTopics: gov.sensitive.topics.map((t) => t.topic),
    piiKinds: [...new Set(gov.pii.findings.map((f) => f.kind))],
    requiresHitl: gov.sensitive.requiresHitl,
    blockAiOnly: gov.sensitive.blockAiOnly,
    reasons: gov.reasons,
    status: "pending",
    queuedAt: new Date().toISOString(),
  };
  reviewService.enqueue(item);

  return c.json({
    ok: true,
    queued: true,
    reviewId: item.id,
    aiLabel: item.aiLabel,
    aiLabelText: AI_LABEL_TEXT[item.aiLabel],
    publishAllowed: gov.publishGuard.allowed,
    reasons: gov.reasons,
    message: gov.publishGuard.allowed
      ? "검수 큐에 등록되었습니다. 편집부 승인 후 발행됩니다."
      : `발행 보류: ${gov.publishGuard.reason ?? "요건 미충족"} (검수 큐에 등록됨)`,
  });
});
