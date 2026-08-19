// 선관위 후보자 → 지식그래프. 인물 노드를 **새로 만들지 않고 보강**한다.
//
//   person 노드 id는 `person:<이름>` 형식이라 이름이 같으면 같은 노드다.
//   태안 정치인은 이미 기사 추출로 들어와 있고(홍상금·가세로·윤희신·김영인 확인),
//   생년월일도 소속도 없는 껍데기다. 선관위 자료로 그 껍데기를 채운다.
//
//   실제 응답으로 확인한 필드(2026-08-19):
//     name·hanjaName·gender·birthday·age·addr·job·edu·jdName(정당)
//     sggName(선거구)·wiwName·giho(기호)·career1·career2·status·huboid
//   ⚠ 재산·전과·병역은 **응답에 아예 없다** — 범위를 좁힐 걱정이 없어졌다.

import type { Env } from "../types";
import { call, readItems, readTotal, fetchElections } from "./nec";

const OP = "PofelcddInfoInqireService/getPofelcddRegistSttusInfoInqire";

/** 실측으로 확인된 조회 조건. wiwName은 무시되고(276건 중 태안 0), sggName이 앞부분 일치로 걸린다. */
export const TAEAN_QUERY = { sdName: "충청남도", sggName: "태안군" };

export interface NecCandidate {
  huboid?: string; sgId?: string; sgTypecode?: string;
  name?: string; hanjaName?: string; gender?: string; birthday?: string; age?: string;
  jdName?: string; sggName?: string; wiwName?: string; giho?: string;
  job?: string; edu?: string; addr?: string;
  career1?: string; career2?: string; status?: string;
}

/**
 * 공백 정규화 — 선관위 값은 공백이 두 칸씩 온다("(현)  더불어민주당  충남도당  부위원장").
 *   그대로 두면 조직 이름 대조가 전부 어긋난다.
 */
export const tidy = (s: string | undefined | null): string => (s ?? "").replace(/\s+/g, " ").trim();

export interface CareerLine { tense: "현" | "전" | null; text: string }

/** 경력 한 줄 → 시제 + 내용. `(현)`/`(전)` 표기를 떼어낸다. */
export function parseCareerLine(raw: string | undefined): CareerLine | null {
  const s = tidy(raw);
  if (!s || s === "미기재") return null;
  const m = s.match(/^\(\s*(현|전)\s*\)\s*(.+)$/);
  if (m) return { tense: m[1] as "현" | "전", text: tidy(m[2]) };
  return { tense: null, text: s };
}

/** career1·career2를 한 목록으로. 빈 칸·'미기재'는 버린다. */
export function parseCareers(c: NecCandidate): CareerLine[] {
  return [c.career1, c.career2].map(parseCareerLine).filter((x): x is CareerLine => !!x);
}

/**
 * 선거구에서 '태안군' 뒤의 구분만 남긴다 — "태안군가선거구" → "가선거구".
 *   군수·도의원은 선거구가 "태안군"이라 구분이 없다(그 경우 빈 문자열).
 */
export function districtOf(sggName: string | undefined): string {
  const s = tidy(sggName);
  return s.startsWith("태안군") ? s.slice(3) : s;
}

/** 정당 → org 노드 id. 무소속은 조직이 아니므로 null. */
export function partyOrgId(jdName: string | undefined): string | null {
  const s = tidy(jdName);
  if (!s || s === "무소속") return null;
  return `org:party-${s}`;
}

export interface PersonAttrs {
  birthday?: string; hanja?: string; gender?: string;
  party?: string; district?: string; giho?: string;
  job?: string; edu?: string;
  careers?: CareerLine[];
  election?: string;   // sgId — 어느 선거 자료인지
  huboid?: string;
}

/** 후보자 → 인물 노드에 붙일 속성. 빈 값·'미기재'는 넣지 않는다(빈 칸을 사실처럼 보이게 하지 않는다). */
export function toPersonAttrs(c: NecCandidate): PersonAttrs {
  const put = (v: string | undefined) => {
    const s = tidy(v);
    return s && s !== "미기재" ? s : undefined;
  };
  const careers = parseCareers(c);
  const attrs: PersonAttrs = {
    birthday: put(c.birthday), hanja: put(c.hanjaName), gender: put(c.gender),
    party: put(c.jdName), district: districtOf(c.sggName) || undefined, giho: put(c.giho),
    job: put(c.job), edu: put(c.edu),
    election: put(c.sgId), huboid: put(c.huboid),
  };
  if (careers.length) attrs.careers = careers;
  // undefined 키를 지워 JSON을 깔끔하게 — 없는 값과 빈 값을 구별한다.
  return Object.fromEntries(Object.entries(attrs).filter(([, v]) => v !== undefined)) as PersonAttrs;
}

const SOURCE = (sgId: string) => `중앙선관위 후보자등록(${sgId})`;

/** 후보자 목록 → 적재 시드(인물 노드 + 정당 조직 + 정당 소속). */
export function toSeed(cands: NecCandidate[]) {
  const nodes: Array<{ id: string; type: string; name: string; aliases?: string; attrs?: unknown; source: string }> = [];
  const edges: Array<{ id: string; src_id: string; rel: string; dst_id: string; attrs?: unknown; source: string }> = [];
  const parties = new Set<string>();

  for (const c of cands) {
    const name = tidy(c.name);
    if (!name) continue;
    const sgId = tidy(c.sgId) || "?";
    const src = SOURCE(sgId);
    const pid = `person:${name}`;
    nodes.push({ id: pid, type: "person", name, attrs: toPersonAttrs(c), source: src });

    const partyId = partyOrgId(c.jdName);
    if (partyId && !parties.has(partyId)) {
      parties.add(partyId);
      nodes.push({ id: partyId, type: "org", name: tidy(c.jdName), aliases: tidy(c.jdName), source: src });
    }
    if (partyId) {
      edges.push({
        id: `${pid}--belongs_to--${partyId}`,
        src_id: pid, rel: "belongs_to", dst_id: partyId,
        // 후보 등록 시점의 소속이다 — 언제 기준인지 남겨야 나중에 바뀌어도 읽을 수 있다.
        attrs: { role: "소속 정당", years: sgId.slice(0, 4), evidence: `${sgId} 후보자 등록` },
        source: src,
      });
    }
  }
  // 정당 노드가 인물보다 먼저 들어가야 엣지가 붙는다(엣지는 양끝 노드를 요구한다).
  nodes.sort((a, b) => (a.type === b.type ? 0 : a.type === "org" ? -1 : 1));
  return { nodes, edges };
}

/**
 * 우리가 담을 선거 종류를 **목록에서 찾아낸다**(코드 번호를 짐작하지 않는다).
 *   비례대표를 지역구 코드로만 조회해 최성미 의원이 통째로 빠졌던 일이 있다(2026-08-19).
 *   선거 목록의 각 줄에 sgTypecode와 이름이 함께 오므로, 이름으로 고르는 편이 안전하다.
 */
export const WANTED = [
  { key: "군수", match: /구.?시.?군의? 장/ },
  { key: "도의원", match: /시.?도의회의원/ },
  { key: "군의원", match: /구.?시.?군의회의원/ },
  { key: "도의원(비례)", match: /광역의원비례/ },
  { key: "군의원(비례)", match: /기초의원비례/ },
] as const;

export interface ElectionKind { key: string; sgTypecode: string; sgId: string; sgName: string }

/** 최신 선거일의 종류별 코드. 이름이 우리 관심사와 맞는 줄만 고른다. */
export function pickKinds(rows: Array<{ sgId?: string; sgName?: string; sgTypecode?: string }>): ElectionKind[] {
  const ids = [...new Set(rows.map((r) => String(r.sgId ?? "")))].filter(Boolean).sort().reverse();
  const latest = ids[0];
  if (!latest) return [];
  const out: ElectionKind[] = [];
  for (const w of WANTED) {
    const hit = rows.find((r) => String(r.sgId) === latest && w.match.test(tidy(r.sgName)));
    if (hit?.sgTypecode) out.push({ key: w.key, sgTypecode: String(hit.sgTypecode), sgId: latest, sgName: tidy(hit.sgName) });
  }
  return out;
}

/** 태안 후보자 받기 — 선거 종류별로 최신 회차부터. */
export async function fetchTaeanCandidates(env: Env, sgTypecode: string, sgId?: string): Promise<{ sgId: string; items: NecCandidate[] }> {
  let target = sgId;
  if (!target) {
    const elections = await fetchElections(env, sgTypecode);
    const ids = [...new Set(elections.map((e) => String(e.sgId)))].sort().reverse();
    target = ids[0];
  }
  if (!target) return { sgId: "", items: [] };
  const out: NecCandidate[] = [];
  for (let page = 1; page <= 5; page++) {
    const body = await call(env, OP, { pageNo: page, numOfRows: 100, sgId: target, sgTypecode, ...TAEAN_QUERY });
    const items = readItems<NecCandidate>(body);
    out.push(...items);
    if (items.length < 100 || out.length >= readTotal(body)) break;
  }
  return { sgId: target, items: out };
}
