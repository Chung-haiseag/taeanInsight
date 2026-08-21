// 선관위 **당선인** — 후보자 자료에는 당락이 없다. 등록 여부(status="등록")만 온다.
//
//   당진시대 인물 화면의 '결과 · 당선' 칸이 바로 이 자료다. 이게 붙어야
//   "1998년 태안군의원이 누구였나"에 답할 수 있다.
//
//   ⚠ 이 파일에서 가장 중요한 규칙: **당선자 목록을 못 받은 회차는 낙선으로 단정하지 않는다.**
//     '목록에 없으니 낙선'은 목록을 받았을 때만 성립한다. 못 받았는데 그렇게 적으면
//     실제 당선자를 낙선으로 기록해 사실층(verified=1)에 넣게 된다 — 지어내기와 같다.
//     그래서 회차·종류별로 **받아왔는지(covered)** 를 따로 기억하고, 받은 것만 판정한다.

import type { Env } from "../types";
import { tidy } from "./nec_import";
import { fetchTaeanRows, type ElectionDay } from "./nec_history";
import type { GroupResult, PersonGroup } from "./nec_people";

const OP_WINNER = "WinnerInfoInqireService2/getWinnerInfoInqire";

export interface WinnerRow { sgId?: string; sgTypecode?: string; sggName?: string; jdName?: string; [k: string]: unknown }

/**
 * 당선자 이름 읽기(순수).
 *   당선인 API의 필드 이름을 문서만 보고 단정하지 않는다 — 후보자 API와 다를 수 있다.
 *   흔한 후보를 차례로 보고, 못 찾으면 빈 문자열(조용히 아무 값이나 쓰지 않는다).
 */
export function readWinnerName(row: unknown): string {
  const r = (row ?? {}) as Record<string, unknown>;
  for (const k of ["name", "hangulName", "krName", "hgName", "cnddtNm", "candNm"]) {
    const v = tidy(typeof r[k] === "string" ? (r[k] as string) : undefined);
    if (v) return v;
  }
  return "";
}

/** 조회 키 — 같은 선거일·같은 종류 안에서 이름이면 갈린다. */
export const winnerKey = (sgId: string, kind: string, name: string) => `${sgId}|${kind}|${name}`;
/** 받아온 회차·종류 표시 — 판정해도 되는 범위. */
export const coverKey = (sgId: string, kind: string) => `${sgId}|${kind}`;

export interface WinnerIndex { covered: Set<string>; keys: Set<string> }

export interface FetchedWinners { sgId: string; kind: string; rows: WinnerRow[] }

/** 받아온 당선자 목록 → 색인(순수). 빈 목록이어도 '받았다'는 사실은 기록한다. */
export function buildWinnerIndex(fetched: FetchedWinners[]): WinnerIndex {
  const covered = new Set<string>();
  const keys = new Set<string>();
  for (const f of fetched) {
    covered.add(coverKey(f.sgId, f.kind));
    for (const r of f.rows) {
      const name = readWinnerName(r);
      if (name) keys.add(winnerKey(f.sgId, f.kind, name));
    }
  }
  return { covered, keys };
}

function markGroup(p: PersonGroup, idx: WinnerIndex): void {
  for (const run of p.runs) {
    // 받아오지 못한 회차는 **모르는 채로 둔다** — 낙선으로 단정하면 거짓이 된다.
    if (!idx.covered.has(coverKey(run.sgId, run.kind))) continue;
    run.result = idx.keys.has(winnerKey(run.sgId, run.kind, p.name)) ? "당선" : "낙선";
  }
}

/** 출마 기록에 당락을 매긴다(제자리 수정). 격리된 동명이인도 화면에 보여야 하므로 함께 매긴다. */
export function markResults(g: GroupResult, idx: WinnerIndex): void {
  for (const p of g.people) markGroup(p, idx);
  for (const a of g.ambiguous) for (const p of a.people) markGroup(p, idx);
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * 회차별 당선자 받기.
 *   회차 하나가 실패하면 **그 회차만** covered에서 빠진다 — 나머지 판정은 그대로 유효하다.
 *   국회의원은 선거구가 합구('서산시태안군')라 조회로 좁힐 수 없어 충남 전체를 받아 거른다.
 */
export async function fetchWinners(
  env: Env, local: ElectionDay[], assembly: ElectionDay[],
): Promise<{ fetched: FetchedWinners[]; failed: Array<{ sgId: string; kind: string; error: string }>; sample: WinnerRow | null }> {
  const fetched: FetchedWinners[] = [];
  const failed: Array<{ sgId: string; kind: string; error: string }> = [];
  let sample: WinnerRow | null = null;

  for (const d of [...local, ...assembly]) {
    for (const k of d.kinds) {
      try {
        // 후보자와 **같은 조회 조건 사다리**를 쓴다 — 회차마다 선거구 표기가 달라
        //   한 조건으로는 30년치를 못 덮는다(2026-08-22 실측).
        const r = await fetchTaeanRows(env, OP_WINNER, d.sgId, k.sgTypecode);
        if (!sample && r.rows.length) sample = r.rows[0] as WinnerRow;
        fetched.push({ sgId: d.sgId, kind: k.key, rows: r.rows as WinnerRow[] });
      } catch (e) {
        failed.push({ sgId: d.sgId, kind: k.key, error: errMsg(e) });
      }
    }
  }
  return { fetched, failed, sample };
}
