// 중앙선거관리위원회 오픈API — 인물 "정답층".
//
//   왜 필요한가:
//     · mayors.ts·council_members.ts는 군청·의회 홈페이지에서 **손으로 옮긴 명단**이다.
//       선거가 있을 때마다 사람이 고쳐야 하고, 역대 기록은 이름·사진뿐이다.
//     · 소속(belongs_to)은 신문 문장에서 정규식으로 캐내다 보니 정밀도 싸움이 길었고,
//       지금도 검수 대기열이 남아 있다.
//   선관위 후보자 등록현황은 **후보자 본인이 신고하고 선관위가 공고한 법정 자료**다.
//   경력 칸이 곧 소속 목록이고, 생년월일은 person 34,510개에 섞인 동명이인을 가르는 열쇠다.
//
//   ⚠ 쓰는 항목을 좁힌다 — 재산·전과·병역·납세는 가져오지 않는다.
//     선거기간 유권자 판단용으로 공개되는 자료를 상시 인물 DB에 박아두는 것은 성격이 다르다.

import type { Env } from "../types";

const BASE = "https://apis.data.go.kr/9760000";

// 선거 종류 코드(선관위 규격). 태안 지역 인물에 관계있는 것만.
export const SG_TYPE = {
  대통령: "1",
  국회의원: "2",
  시도지사: "3",
  구시군장: "4",     // ← 태안군수
  시도의원: "5",     // ← 충남도의원
  구시군의원: "6",   // ← 태안군의원
} as const;

/** data.go.kr 공통 오류 봉투 — 정상 응답과 형태가 아예 다르다. */
interface ErrEnvelope {
  OpenAPI_ServiceResponse?: { cmmMsgHeader?: { errMsg?: string; returnReasonCode?: string } };
}

export interface NecError { code: string; msg: string }

/**
 * 오류 봉투 판별(순수) — 없으면 null.
 *   코드 20=키 없음 · 12=없는 서비스(경로 오류) · 30=키 미승인(활용신청 대기).
 *   ferry·aqua에서 같은 함정을 겪었다: 경로 오류와 미승인은 원인이 전혀 다른데 둘 다 "안 된다"로 보인다.
 */
export function readError(body: unknown): NecError | null {
  const h = (body as ErrEnvelope)?.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (!h) return null;
  return { code: String(h.returnReasonCode ?? "?"), msg: String(h.errMsg ?? "?") };
}

/** 오류 코드 → 사람이 읽을 원인. 무엇을 해야 하는지까지 적는다. */
export function explainError(e: NecError): string {
  switch (e.code) {
    case "20": return "서비스키 없음 — DATA_GO_KR_KEY 시크릿이 비었습니다";
    case "12": return "없는 서비스 — 오퍼레이션 경로가 틀렸습니다";
    case "30": return "키 미승인 — data.go.kr에서 이 API 활용신청이 아직 승인되지 않았습니다";
    case "22": return "일일 호출 한도 초과";
    default: return `${e.msg} (코드 ${e.code})`;
  }
}

/** 응답에서 items 배열만 꺼낸다(순수). 1건이면 객체로 오는 data.go.kr 습성을 흡수. */
export function readItems<T>(body: unknown): T[] {
  const it = (body as { response?: { body?: { items?: { item?: T | T[] } | T[] } } })?.response?.body?.items;
  if (!it) return [];
  const item = Array.isArray(it) ? it : (it as { item?: T | T[] }).item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

/** 총 건수(페이징 판단용). 없으면 0. */
export function readTotal(body: unknown): number {
  const n = (body as { response?: { body?: { totalCount?: number | string } } })?.response?.body?.totalCount;
  return Number(n ?? 0) || 0;
}

/** 오퍼레이션 호출. 오류 봉투면 throw(원인 문구 포함) — 조용히 빈 배열을 주면 진단이 어렵다. */
export async function call(env: Env, path: string, params: Record<string, string | number>): Promise<unknown> {
  const key = env.DATA_GO_KR_KEY;
  if (!key) throw new Error("DATA_GO_KR_KEY 미설정");
  const q = new URLSearchParams({ serviceKey: key, resultType: "json", ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
  const res = await fetch(`${BASE}/${path}?${q}`, { headers: { Accept: "application/json" } });
  const text = await res.text();
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new Error(`선관위 응답 파싱 실패(${res.status}): ${text.slice(0, 200)}`); }
  const err = readError(body);
  if (err) throw new Error(`선관위 ${path}: ${explainError(err)}`);
  return body;
}

export interface SgCode { sgId: string; sgName: string; sgTypecode: string; sgVotedate?: string }

/**
 * 선거 목록 — sgId(선거일 YYYYMMDD)를 얻어야 후보자·당선인을 부를 수 있다.
 *   ⚠ **전체 페이지를 받아야 한다.** 첫 100건만 받으면 재보궐선거만 잡히고 정작
 *     전국동시지방선거(2022·2018·2014)를 놓친다 — 실제로 그렇게 0건이 나왔다.
 */
export async function fetchElections(env: Env, sgTypecode: string): Promise<SgCode[]> {
  const out: SgCode[] = [];
  for (let page = 1; page <= 10; page++) {
    const body = await call(env, "CommonCodeService/getCommonSgCodeList", { pageNo: page, numOfRows: 100, sgTypecode });
    const items = readItems<SgCode>(body);
    out.push(...items);
    if (items.length < 100 || out.length >= readTotal(body)) break;
  }
  return out;
}

/**
 * 태안 후보자 표본 — **파서를 짜기 전에 실제 필드를 눈으로 보기 위한 것**.
 *   응답 형태를 모르는 채 파서를 먼저 쓰면 틀린다(낭독 정렬에서 겪은 그대로).
 *   최신 선거부터 훑어 태안 후보가 잡히는 첫 회차의 원자료를 그대로 돌려준다.
 */
export interface SampleAttempt { how: string; total: number; matched: number; note?: string }

// 지역을 좁히는 조회 조건 후보 — 어느 이름이 먹는지 문서만 봐선 알 수 없어 함께 시도한다.
//   (전체 4,402건을 100건씩 45쪽 받는 건 낭비다. 서버에서 좁히는 게 맞다.)
const NARROWERS: Array<{ how: string; params: Record<string, string> }> = [
  { how: "sdName+wiwName", params: { sdName: "충청남도", wiwName: "태안군" } },
  { how: "sdName+sggName", params: { sdName: "충청남도", sggName: "태안군" } },
  { how: "wiwName만", params: { wiwName: "태안군" } },
  { how: "sdName만", params: { sdName: "충청남도" } },
];

const OP = "PofelcddInfoInqireService/getPofelcddRegistSttusInfoInqire";
const hasTaean = (r: unknown) => JSON.stringify(r).includes("태안");

/**
 * 태안 후보자 표본 — **파서를 짜기 전에 실제 필드를 눈으로 보기 위한 것**.
 *   응답 형태를 모르는 채 파서를 먼저 쓰면 틀린다(낭독 정렬에서 겪은 그대로).
 *
 *   조회 조건 이름(sdName/sggName/wiwName)이 어느 것인지 확실치 않아 차례로 시도하고,
 *   **시도마다 전체·태안 건수를 남긴다** — 0건일 때 '조건이 틀림'인지 '태안이 없음'인지 갈라야 하므로.
 */
export async function fetchTaeanSample(env: Env, sgTypecode: string): Promise<{
  elections: number; sgId: string | null; attempts: SampleAttempt[];
  how: string | null; matched: number; sample: unknown | null; fields: string[];
}> {
  const elections = await fetchElections(env, sgTypecode);
  // 같은 날짜가 선거종류만 달리해 여러 줄로 오므로 날짜를 중복 제거한다.
  const ids = [...new Set(elections.map((e) => String(e.sgId)))].sort().reverse().slice(0, 3);
  const attempts: SampleAttempt[] = [];

  for (const sgId of ids) {
    for (const n of NARROWERS) {
      let items: Array<Record<string, unknown>> = [];
      let total = 0;
      try {
        const body = await call(env, OP, { pageNo: 1, numOfRows: 100, sgId, sgTypecode, ...n.params });
        items = readItems<Record<string, unknown>>(body);
        total = readTotal(body);
      } catch (e) {
        attempts.push({ how: `${sgId} ${n.how}`, total: 0, matched: 0, note: e instanceof Error ? e.message.slice(0, 80) : "오류" });
        continue;
      }
      const hit = items.filter(hasTaean);
      attempts.push({ how: `${sgId} ${n.how}`, total, matched: hit.length });
      if (hit.length) {
        return { elections: elections.length, sgId, attempts, how: n.how, matched: hit.length, sample: hit[0], fields: Object.keys(hit[0]) };
      }
    }
  }
  return { elections: elections.length, sgId: ids[0] ?? null, attempts, how: null, matched: 0, sample: null, fields: [] };
}
