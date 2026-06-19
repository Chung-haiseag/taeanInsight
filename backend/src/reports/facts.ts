// 주간 리포트 사실 자료 로더 — 섹션별로 아카이브(기사) + 환경 스냅샷(env_daily) +
// 관광 축제/관광지(TourAPI)를 모아 LLM 프롬프트의 [참고 자료]로 주입한다.
// 외부 호출 실패는 빈 문자열로 격리.

import type { Env } from "../types";
import type { ReportSectionKey } from "./types";
import { fetchConditions } from "../env/sources";
import { fetchTour } from "../env/tour";
import { fetchRealEstate } from "../env/realestate";

// 섹션별 아카이브 검색 키워드 (LIKE OR)
const SECTION_KEYWORDS: Record<ReportSectionKey, string[]> = {
  summary: ["태안", "태안군"],
  tourism_weather: ["관광", "축제", "안면도", "만리포", "천리포", "해수욕장", "여행", "꽃지", "관광객"],
  environment: ["환경", "가로림만", "적조", "미세먼지", "해양", "신두리", "갯벌", "오염", "생태"],
  realestate: ["부동산", "토지", "아파트", "분양", "거래", "매매", "시세", "공시지가", "개발", "임대"],
  events: ["행사", "축제", "전시", "체험", "공연", "문화", "박람회", "프로그램", "개최"],
};

// 최근 N일 기사 중 키워드 매칭 제목·발췌
async function recentArticles(
  db: D1Database,
  keywords: string[],
  days = 45,
  limit = 10,
  excerpt = 700,
): Promise<string[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const likes = keywords.map((_, i) => `(a.title LIKE ?${i + 3} OR a.body LIKE ?${i + 3})`).join(" OR ");
  try {
    const res = await db
      .prepare(
        `SELECT a.title, a.published_at, substr(a.body,1,?2) AS body
           FROM archive_articles a
          WHERE a.published_at >= ?1 AND (${likes})
          ORDER BY a.published_at DESC LIMIT ${limit}`,
      )
      .bind(since, excerpt, ...keywords.map((k) => `%${k}%`))
      .all<{ title: string; published_at: string; body: string }>();
    return (res.results ?? []).map(
      (r) => `· [${String(r.published_at).slice(0, 10)}] ${r.title}\n  ${r.body.replace(/\s+/g, " ").trim()}`,
    );
  } catch {
    return [];
  }
}

// 최근 기사 제목만 (요약 섹션용 — 본문 없이 흐름 파악)
async function recentTitles(db: D1Database, keywords: string[], days = 14, limit = 14): Promise<string[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const likes = keywords.map((_, i) => `(a.title LIKE ?${i + 1})`).join(" OR ");
  try {
    const res = await db
      .prepare(`SELECT a.title, a.published_at FROM archive_articles a WHERE a.published_at >= '${since}' AND (${likes}) ORDER BY a.published_at DESC LIMIT ${limit}`)
      .bind(...keywords.map((k) => `%${k}%`))
      .all<{ title: string; published_at: string }>();
    return (res.results ?? []).map((r) => `· [${String(r.published_at).slice(0, 10)}] ${r.title}`);
  } catch {
    return [];
  }
}

// 최근 7일 환경 스냅샷 요약 (env_daily)
async function recentEnv(db: D1Database): Promise<string> {
  try {
    const res = await db
      .prepare(
        `SELECT date, pm10, pm25, temp, humidity, sky FROM env_daily
          ORDER BY date DESC LIMIT 7`,
      )
      .all<{ date: string; pm10: number | null; pm25: number | null; temp: number | null; humidity: number | null; sky: string | null }>();
    const rows = res.results ?? [];
    if (!rows.length) return "";
    return rows
      .map((r) => `${r.date}: 기온 ${r.temp ?? "?"}℃, 습도 ${r.humidity ?? "?"}%, PM10 ${r.pm10 ?? "?"}, PM2.5 ${r.pm25 ?? "?"}, 하늘 ${r.sky ?? "?"}`)
      .join("\n");
  } catch {
    return "";
  }
}

// 실시간 관측값 한 줄
async function liveConditions(env: Env): Promise<string> {
  if (!env.DATA_GO_KR_KEY) return "";
  try {
    const cond = await fetchConditions(env);
    if (!cond.available) return "";
    const w = cond.weather, a = cond.air;
    return (
      `[실시간 관측] 기온 ${w.temp ?? "?"}℃, 습도 ${w.humidity ?? "?"}%, 하늘 ${w.sky ?? "?"}, ` +
      `PM10 ${a.pm10 ?? "?"}, PM2.5 ${a.pm25 ?? "?"}, 통합대기 '${a.grade ?? "?"}'`
    );
  } catch {
    return "";
  }
}

// 태안군청 군정 게시판(gov_notices) — 보드명/키워드로 최근 글
async function govNotices(
  db: D1Database,
  opts: { boardName?: string; keywords?: string[]; days?: number; limit?: number; titlesOnly?: boolean },
): Promise<string[]> {
  const since = new Date(Date.now() - (opts.days ?? 21) * 86_400_000).toISOString().slice(0, 10);
  const where: string[] = ["published_at >= ?1"];
  const binds: unknown[] = [since];
  if (opts.boardName) { binds.push(opts.boardName); where.push(`board_name = ?${binds.length}`); }
  if (opts.keywords?.length) {
    const ors = opts.keywords.map((k) => { binds.push(`%${k}%`); return `(title LIKE ?${binds.length} OR body LIKE ?${binds.length})`; });
    where.push(`(${ors.join(" OR ")})`);
  }
  try {
    const r = await db
      .prepare(
        `SELECT board_name, title, dept, published_at, substr(body,1,500) AS body
           FROM gov_notices WHERE ${where.join(" AND ")}
          ORDER BY published_at DESC LIMIT ${opts.limit ?? 6}`,
      )
      .bind(...binds)
      .all<{ board_name: string; title: string; dept: string; published_at: string; body: string }>();
    return (r.results ?? []).map((x) =>
      opts.titlesOnly
        ? `· [${x.published_at}] ${x.title} (${x.board_name})`
        : `· [${x.published_at}] ${x.title} (${x.board_name}${x.dept ? `·${x.dept}` : ""})\n  ${x.body.replace(/\s+/g, " ").trim()}`,
    );
  } catch {
    return [];
  }
}

// 만원 → "2.1억"/"8,500만원"
const wonFmt = (n: number): string => (!n ? "?" : n >= 10000 ? `${(n / 10000).toFixed(1)}억` : `${n.toLocaleString()}만원`);

// 부동산 실거래가 — 국토부 RTMS. 집계(건수·평균·최고가)까지 제공해 정량 인사이트 유도.
async function realEstateFacts(env: Env): Promise<string> {
  try {
    const re = await fetchRealEstate(env);
    if (!re.available) return "";
    const parts: string[] = [];

    if (re.apartments.length) {
      const vals = re.apartments.map((a) => a.manwon).filter((n) => n > 0);
      const avg = vals.length ? Math.round(vals.reduce((s, n) => s + n, 0) / vals.length) : 0;
      const top = [...re.apartments].sort((a, b) => b.manwon - a.manwon)[0];
      parts.push(
        `[아파트 실거래 요약] 최근 거래 ${re.apartments.length}건, 평균 ${wonFmt(avg)}, ` +
          `최고가 ${top.dong} ${top.name} ${top.area}㎡ ${top.amount}(${top.ymd}), 최저 ${wonFmt(Math.min(...vals))}\n` +
          "[아파트 실거래 상세]\n" +
          re.apartments.slice(0, 8).map((a) => `· ${a.ymd} ${a.dong} ${a.name} ${a.area}㎡ ${a.amount}${a.floor ? ` (${a.floor}층)` : ""}`).join("\n"),
      );
    }
    if (re.lands.length) {
      const vals = re.lands.map((l) => l.manwon).filter((n) => n > 0);
      const top = [...re.lands].sort((a, b) => b.manwon - a.manwon)[0];
      parts.push(
        `[토지 실거래 요약] 최근 거래 ${re.lands.length}건(총 거래가 기준), 최고가 ${top.dong} ${top.jimok || "토지"} ${top.area}㎡ ${top.amount}, 최저 ${wonFmt(Math.min(...vals))}\n` +
          "[토지 실거래 상세]\n" +
          re.lands.slice(0, 8).map((l) => `· ${l.ymd} ${l.dong} ${l.jimok || "토지"} ${l.area}㎡ ${l.amount}${l.use ? ` (${l.use})` : ""}`).join("\n"),
      );
    }
    return parts.join("\n\n");
  } catch {
    return "";
  }
}

// 관광 축제(현재·예정) + 대표 관광지 — TourAPI
async function tourInfo(env: Env, withAttractions: boolean): Promise<string> {
  if (!env.DATA_GO_KR_KEY) return "";
  try {
    const t = await fetchTour(env);
    if (!t.available) return "";
    const parts: string[] = [];
    if (t.festivals.length) {
      const fmt = (d: string) => (d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d);
      parts.push(
        "[현재·예정 축제]\n" +
          t.festivals
            .slice(0, 12)
            .map((f) => `· ${f.title} (${fmt(f.start)}~${fmt(f.end)}) @ ${f.addr || "태안군"}`)
            .join("\n"),
      );
    }
    if (withAttractions && t.attractions.length) {
      parts.push("[대표 관광지]\n" + t.attractions.slice(0, 8).map((a) => `· ${a.title} @ ${a.addr || "태안군"}`).join("\n"));
    }
    return parts.join("\n\n");
  } catch {
    return "";
  }
}

/**
 * env를 받아 WeeklyReportPipeline의 factsLoader로 쓸 함수를 만든다.
 * (weekId, sectionKey) → "참고 자료" 텍스트.
 */
export function makeFactsLoader(env: Env) {
  return async (_weekId: string, sectionKey: ReportSectionKey): Promise<string> => {
    const parts: string[] = [];

    // 기사: 요약은 제목만(흐름 파악·중복 방지), 나머지는 본문 발췌
    if (env.ARCHIVE_DB) {
      if (sectionKey === "summary") {
        const titles = await recentTitles(env.ARCHIVE_DB, SECTION_KEYWORDS.summary, 14, 16);
        if (titles.length) parts.push(`[이번 주 태안신문 제목]\n${titles.join("\n")}`);
      } else {
        const articles = await recentArticles(env.ARCHIVE_DB, SECTION_KEYWORDS[sectionKey]);
        if (articles.length) parts.push(`[최근 태안신문 기사]\n${articles.join("\n")}`);
      }
    }

    // 환경·관광기상: 환경 추세 + 실시간 관측
    if (sectionKey === "environment" || sectionKey === "tourism_weather") {
      if (env.ARCHIVE_DB) {
        const trend = await recentEnv(env.ARCHIVE_DB);
        if (trend) parts.push(`[최근 7일 환경 추세]\n${trend}`);
      }
      const live = await liveConditions(env);
      if (live) parts.push(live);
    }

    // 관광기상·이벤트: 축제·관광지(TourAPI)
    if (sectionKey === "tourism_weather" || sectionKey === "events") {
      const tour = await tourInfo(env, sectionKey === "tourism_weather");
      if (tour) parts.push(tour);
    }

    // 부동산: 국토부 실거래가(아파트·토지)
    if (sectionKey === "realestate") {
      const re = await realEstateFacts(env);
      if (re) parts.push(re);
    }

    // 태안군청 군정 게시판(공식 일정·공지·정책) 주입
    if (env.ARCHIVE_DB) {
      let gov: string[] = [];
      if (sectionKey === "summary") {
        gov = await govNotices(env.ARCHIVE_DB, { days: 14, limit: 10, titlesOnly: true });
      } else if (sectionKey === "events") {
        // 공식 주간행사계획 우선 + 행사 키워드
        const sched = await govNotices(env.ARCHIVE_DB, { boardName: "주간행사계획", days: 21, limit: 4 });
        const ev = await govNotices(env.ARCHIVE_DB, { keywords: SECTION_KEYWORDS.events, days: 21, limit: 5 });
        gov = [...sched, ...ev];
      } else if (sectionKey === "realestate") {
        gov = await govNotices(env.ARCHIVE_DB, { keywords: ["개발", "도시", "분양", "공고", "투자", "예산", "지원"], days: 30, limit: 5 });
      } else if (sectionKey === "environment") {
        gov = await govNotices(env.ARCHIVE_DB, { keywords: SECTION_KEYWORDS.environment, days: 30, limit: 5 });
      } else if (sectionKey === "tourism_weather") {
        gov = await govNotices(env.ARCHIVE_DB, { keywords: SECTION_KEYWORDS.tourism_weather, days: 21, limit: 5 });
      }
      if (gov.length) parts.push(`[태안군청 군정 소식]\n${gov.join("\n")}`);
    }

    return parts.join("\n\n");
  };
}
