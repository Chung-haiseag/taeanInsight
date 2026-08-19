// 선관위 경력 → 조직. 실측(2026-08-20, 20명 40줄)에서 배운 것을 규칙으로 굳힌다.
//
//   ⚠ **부분 일치로 붙이면 안 된다.** 단순 대조를 재보니 오귀속이 곧바로 되살아났다:
//     · "태안읍체육회장"     → 태안군체육회 (X) — 태안읍체육회는 별개 단체
//     · "태안군청년네트워크"  → 태안군청     (X) — 태안군청 + 년네트워크
//     · "안면읍 남성의용소방대장" → 안면읍   (X) — 읍·면 이름이 **수식어**로 쓰인다
//   앞의 둘은 지난주 소속 추출을 다섯 번 고치며 막아온 유형과 똑같다.
//
//   그래서 규칙은 하나다: **뽑아낸 단체 이름이 우리 조직과 정확히 같을 때만 잇는다.**
//   같지 않으면 잇지 않고 '새 조직 후보'로 남긴다 — 경력에 나온 단체가 곧 우리가 놓친 조직이다.

import type { OrgDef } from "./affiliation";

/** 단체 이름의 꼬리. 긴 것부터 봐야 '자문회의'가 '회'로 잘리지 않는다. */
const ORG_TAILS = [
  "자문회의", "운동본부", "협의회", "위원회", "연합회", "네트워크", "체육회", "소방대",
  "이장단", "의회", "지부", "학원", "공단", "재단", "조합", "센터", "본부", "연맹", "총회", "지회",
];

/** 직함 — 단체 이름 뒤에 붙는 말. 여기 없는 꼬리는 단체 이름의 일부로 본다. */
const TITLES = [
  "부위원장", "위원장", "부회장", "회장", "부의장", "의장", "부대변인", "대변인",
  "상무위원", "특별보좌역", "보좌관", "위원", "의원", "대표", "대장", "단장",
  "국장", "원장", "소장", "이사", "근무", "장",
];

export interface CareerOrg { org: string; title: string }

const clean = (s: string) =>
  s.replace(/\s+/g, " ")
    .replace(/^\(?\s*(현|전)\s*\)?\s*/, "")           // 시제 표기
    .replace(/[()（）]/g, " ")
    // '제8대,제9대 태안군의회'처럼 대수가 여러 번 붙는다 — 앞쪽 대수와 구분자를 모두 턴다.
    .replace(/^(?:\s*[,·、]?\s*제\s*\d+\s*[대기])+\s*/, "")
    .replace(/^[\s,·、~-]+/, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * 경력 한 줄 → 단체 이름 + 직함(순수).
 *   단체 꼬리(협의회·위원회·의회…)를 **마지막 것으로** 찾아 거기까지를 이름으로 본다.
 *   꼬리가 없으면 단체를 특정할 수 없으므로 null — 짐작하지 않는다.
 */
export function extractCareerOrg(text: string): CareerOrg | null {
  const s = clean(text);
  if (!s) return null;

  let best = -1, tail = "";
  for (const t of ORG_TAILS) {
    const at = s.lastIndexOf(t);
    if (at < 0) continue;
    const end = at + t.length;
    // 더 뒤에서 끝나는 꼬리를 택한다(같은 자리면 긴 쪽 — 목록이 이미 긴 순서).
    if (end > best) { best = end; tail = t; }
  }
  if (best < 0) return null;

  let org = s.slice(0, best).trim();
  let rest = s.slice(best).trim();

  // 꼬리 바로 뒤에 직함이 붙어 있으면('태안군의회의원') 떼어낸다.
  let title = "";
  for (const t of TITLES) {
    if (rest === t || rest.startsWith(t + " ")) { title = t; rest = rest.slice(t.length).trim(); break; }
  }
  if (!title) {
    // '후반기 의장'처럼 사이에 말이 낀 경우 — 남은 말 끝에서 직함을 찾는다.
    for (const t of TITLES) {
      if (rest.endsWith(t)) { title = t; break; }
    }
  }
  // '제9대 태안군의회 후반기' 같은 꼬리 수식어는 이름에서 뺀다.
  org = org.replace(/\s*(후반기|전반기|초대|제\s*\d+\s*[대기])\s*$/, "").trim();
  if (org.length < 3) return null;
  void tail;
  return { org, title };
}

/** 조직 별칭·이름 → id. **정확히 같을 때만** 찾는다(부분 일치 금지). */
export function exactOrgId(name: string, orgs: OrgDef[]): string | null {
  const key = name.replace(/\s+/g, "");
  for (const o of orgs) {
    for (const a of [o.name, ...o.aliases]) {
      if (a.replace(/\s+/g, "") === key) return o.id;
    }
  }
  return null;
}

export interface CareerPerson { id: string; name: string; election?: string; careers?: Array<{ tense: string | null; text: string }> }

export interface CareerResult {
  /** 우리 조직과 정확히 맞아 바로 이을 수 있는 소속 */
  links: Array<{ personId: string; personName: string; orgId: string; orgName: string; title: string; tense: string | null; election?: string }>;
  /** 우리에게 없는 단체 — 검수 후 조직으로 등록할 후보 */
  candidates: Array<{ name: string; people: string[] }>;
  /** 단체 이름을 특정하지 못한 줄(예: '성일종 국회의원 보좌관') */
  unparsed: Array<{ person: string; text: string }>;
}

/** 인물들의 경력 → 이을 소속 + 새 조직 후보 + 못 읽은 줄. */
export function planCareers(people: CareerPerson[], orgs: OrgDef[]): CareerResult {
  const links: CareerResult["links"] = [];
  const cand = new Map<string, Set<string>>();
  const unparsed: CareerResult["unparsed"] = [];

  for (const p of people) {
    for (const c of p.careers ?? []) {
      const co = extractCareerOrg(c.text);
      if (!co) { unparsed.push({ person: p.name, text: c.text }); continue; }
      const orgId = exactOrgId(co.org, orgs);
      if (orgId) {
        const orgName = orgs.find((o) => o.id === orgId)?.name ?? co.org;
        links.push({ personId: p.id, personName: p.name, orgId, orgName, title: co.title, tense: c.tense, election: p.election });
      } else {
        const set = cand.get(co.org) ?? new Set<string>();
        set.add(p.name);
        cand.set(co.org, set);
      }
    }
  }
  // 띄어쓰기만 다른 같은 단체를 하나로 모은다('민주평화통일 자문회의' / '민주평화통일자문회의').
  //   표기는 가장 여러 사람이 쓴 것을 남기고, 같으면 짧은 쪽(대개 공식 표기)을 쓴다.
  const merged = new Map<string, { name: string; people: Set<string> }>();
  for (const [name, s] of cand) {
    const key = name.replace(/\s+/g, "");
    const cur = merged.get(key);
    if (!cur) { merged.set(key, { name, people: new Set(s) }); continue; }
    for (const p of s) cur.people.add(p);
    if (s.size > cur.people.size || (s.size === cur.people.size && name.length < cur.name.length)) cur.name = name;
  }
  return {
    links,
    candidates: [...merged.values()]
      .map((c) => ({ name: c.name, people: [...c.people] }))
      .sort((a, b) => b.people.length - a.people.length || a.name.localeCompare(b.name)),
    unparsed,
  };
}

const SRC = "중앙선관위 후보자 경력";

/** 정확히 맞은 소속만 시드로. 후보 단체는 여기 넣지 않는다(검수를 거친 뒤에 등록한다). */
export function toLinkSeed(r: CareerResult) {
  return {
    nodes: [],
    edges: r.links.map((l) => ({
      id: `${l.personId}--belongs_to--${l.orgId}`,
      src_id: l.personId, rel: "belongs_to", dst_id: l.orgId,
      attrs: {
        role: l.title || undefined,
        years: l.election ? l.election.slice(0, 4) : undefined,
        // 시제를 남긴다 — '전' 소속을 현재처럼 보이게 하면 사실이 아니다.
        evidence: `${l.tense === "전" ? "전직" : l.tense === "현" ? "현직" : "경력"} · 선관위 후보자 등록`,
      },
      source: SRC,
    })),
  };
}
