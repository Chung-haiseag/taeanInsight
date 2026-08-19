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

/** 선거 목록 — sgId(선거일 YYYYMMDD)를 얻어야 후보자·당선인을 부를 수 있다. */
export async function fetchElections(env: Env, sgTypecode: string): Promise<SgCode[]> {
  const body = await call(env, "CommonCodeService/getCommonSgCodeList", { pageNo: 1, numOfRows: 100, sgTypecode });
  return readItems<SgCode>(body);
}
