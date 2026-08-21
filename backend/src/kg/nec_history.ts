// 선관위 **역대 회차** 고르기 — 인물층을 2026년 한 장면에서 30년치로 넓히기 위한 앞단.
//
//   왜 따로 두나: 선거 목록에는 재보궐까지 섞여 한 종류에만 192회차가 온다(실측).
//   전 회차에 후보자 조회를 걸면 호출 낭비이고, 태안과 무관한 날이 대부분이다.
//   그래서 **후보자를 받기 전에 '어느 날이 대상인지'를 먼저 좁힌다.**
//
//   ⚠ 이름 문자열에 기대지 않는다. '제9회 전국동시지방선거'라는 표기는 회차마다 달라질 수 있고,
//     실제로 선관위 값은 공백이 두 칸씩 오는 등 표기가 고르지 않다.
//     대신 **같은 날 여러 종류가 함께 치러졌는지**로 판별한다 — 동시지방선거의 정의 그 자체다.

import type { Env } from "../types";
import { call, readItems, readTotal } from "./nec";
import { WANTED, tidy, TAEAN_QUERY, type ElectionKind, type NecCandidate } from "./nec_import";

export interface ElectionRow { sgId?: string; sgName?: string; sgTypecode?: string }
export interface ElectionDay { sgId: string; year: string; kinds: ElectionKind[] }

/** 재보궐 표기. 총선 회차만 남길 때 쓴다. */
const BYELECTION = /재.?보궐|보궐|재선거/;

const newestFirst = (a: ElectionDay, b: ElectionDay) => b.sgId.localeCompare(a.sgId);
const wantedOrder = (a: ElectionKind, b: ElectionKind) =>
  WANTED.findIndex((w) => w.key === a.key) - WANTED.findIndex((w) => w.key === b.key);

/**
 * 동시지방선거 회차(순수).
 *
 *   선거 목록은 sgTypecode를 하나만 넣어 불러도 **같은 날의 다른 종류까지 함께** 온다
 *   (sgTypecode=6으로 불렀는데 20260603에 8줄이 왔다 — 2026-08-19 실측).
 *   그래서 한 번 부른 목록만으로 '무슨 선거가 언제 함께 있었는지'를 알 수 있다.
 *
 *   @param minKinds 이 수 이상의 종류를 한날 치렀으면 동시지방선거로 본다.
 *     재보궐은 대개 한 종류만 치르므로 3이면 갈린다.
 */
export function localElectionDays(rows: ElectionRow[], minKinds = 3): ElectionDay[] {
  const byDay = new Map<string, ElectionKind[]>();
  for (const r of rows) {
    const sgId = String(r.sgId ?? "");
    if (!sgId || !r.sgTypecode) continue;
    const sgName = tidy(r.sgName);
    // '전국동시지방선거' 총괄 줄(코드 0)은 종류가 아니라 그날의 이름이라 조회 대상이 아니다.
    const w = WANTED.find((x) => x.match.test(sgName));
    if (!w) continue;
    const list = byDay.get(sgId) ?? [];
    if (list.some((k) => k.key === w.key)) continue;   // 같은 종류가 여러 줄로 오는 경우
    list.push({ key: w.key, sgTypecode: String(r.sgTypecode), sgId, sgName });
    byDay.set(sgId, list);
  }
  return [...byDay.entries()]
    .filter(([, kinds]) => kinds.length >= minKinds)
    .map(([sgId, kinds]) => ({ sgId, year: sgId.slice(0, 4), kinds: [...kinds].sort(wantedOrder) }))
    .sort(newestFirst);
}

/** 국회의원 총선 회차(순수). 재보궐은 뺀다 — 회차가 많고 태안이 걸릴 확률이 낮다. */
export function assemblyElectionDays(rows: ElectionRow[]): ElectionDay[] {
  const seen = new Map<string, ElectionDay>();
  for (const r of rows) {
    const sgName = tidy(r.sgName);
    if (!/국회의원/.test(sgName) || BYELECTION.test(sgName)) continue;
    const sgId = String(r.sgId ?? "");
    if (!sgId || seen.has(sgId) || !r.sgTypecode) continue;
    seen.set(sgId, {
      sgId, year: sgId.slice(0, 4),
      kinds: [{ key: "국회의원", sgTypecode: String(r.sgTypecode), sgId, sgName }],
    });
  }
  return [...seen.values()].sort(newestFirst);
}

/**
 * 선거구 이름이 태안을 포함하는가(순수).
 *
 *   ⚠ 지방선거에서 쓰는 `sggName=태안군`(앞부분 일치) 조회는 국회의원 선거에 통하지 않는다.
 *     국회의원 선거구는 '서산시태안군'처럼 **합구**라 앞부분이 태안이 아니다 — 0건이 나온다.
 *     그래서 국회의원은 충남 전체를 받아 이 함수로 걸러야 한다.
 */
export function isTaeanDistrict(sggName: string | undefined | null): boolean {
  return tidy(sggName).replace(/[\s·・]/g, "").includes("태안");
}

// ── 실측 —— 회차별로 태안 후보가 몇 명인지 **후보자를 다 받지 않고** 센다. ─────────────
//   목적은 '어느 회차까지 자료가 있는가'를 눈으로 보는 것이다. 파서를 먼저 쓰면 틀린다.


const OP_CAND = "PofelcddInfoInqireService/getPofelcddRegistSttusInfoInqire";

export interface KindCount { key: string; sgTypecode: string; n: number; error?: string }
export interface DayCount { sgId: string; year: string; total: number; per: KindCount[] }

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** 몇 개씩 나눠 동시에 부른다 — 한 번에 다 던지면 상대 서버가 막고, 하나씩이면 너무 느리다. */
async function inBatches<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

/**
 * 동시지방선거 회차별 태안 후보 수.
 *   `numOfRows=1`로 부르고 totalCount만 읽는다 — 조회 조건이 서버에서 걸리므로
 *   그 수가 곧 태안 후보 수다(2026-08-19 실측: 조건 없이 4,402건 → 조건 주면 12건).
 *   회차 하나가 실패해도 나머지는 계속 센다.
 */
export async function probeLocalDays(env: Env, days: ElectionDay[]): Promise<DayCount[]> {
  const jobs = days.flatMap((d) => d.kinds.map((k) => ({ sgId: d.sgId, k })));
  const counted = await inBatches(jobs, 4, async ({ sgId, k }) => {
    try {
      const body = await call(env, OP_CAND, { pageNo: 1, numOfRows: 1, sgId, sgTypecode: k.sgTypecode, ...TAEAN_QUERY });
      return { sgId, key: k.key, sgTypecode: k.sgTypecode, n: readTotal(body) };
    } catch (e) {
      return { sgId, key: k.key, sgTypecode: k.sgTypecode, n: 0, error: errMsg(e) };
    }
  });
  return days.map((d) => {
    const per = counted.filter((c) => c.sgId === d.sgId).map(({ key, sgTypecode, n, error }) => ({ key, sgTypecode, n, error }));
    return { sgId: d.sgId, year: d.year, total: per.reduce((s, p) => s + p.n, 0), per };
  });
}

/**
 * 국회의원 총선 회차별 태안 후보 수.
 *   ⚠ 지방선거처럼 `sggName=태안군`으로 좁힐 수 없다(선거구가 '서산시태안군' 합구라 앞부분이 다르다).
 *     충남 전체를 받아 선거구 이름으로 거른다 — 회차당 100건 안쪽이라 두 쪽이면 충분하다.
 */
export async function probeAssemblyDays(env: Env, days: ElectionDay[]): Promise<DayCount[]> {
  return inBatches(days, 3, async (d) => {
    const k = d.kinds[0];
    try {
      const items: NecCandidate[] = [];
      for (let page = 1; page <= 2; page++) {
        const body = await call(env, OP_CAND, { pageNo: page, numOfRows: 100, sgId: d.sgId, sgTypecode: k.sgTypecode, sdName: "충청남도" });
        const got = readItems<NecCandidate>(body);
        items.push(...got);
        if (got.length < 100 || items.length >= readTotal(body)) break;
      }
      const n = items.filter((r) => isTaeanDistrict(r.sggName)).length;
      return { sgId: d.sgId, year: d.year, total: n, per: [{ key: k.key, sgTypecode: k.sgTypecode, n }] };
    } catch (e) {
      return { sgId: d.sgId, year: d.year, total: 0, per: [{ key: k.key, sgTypecode: k.sgTypecode, n: 0, error: errMsg(e) }] };
    }
  });
}
