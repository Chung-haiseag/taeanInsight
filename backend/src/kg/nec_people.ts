// 선관위 후보자 **여러 회차** → 인물. 2026년 한 장면을 30년치 이력으로 넓히는 부분.
//
//   ⚠ 여기서 가장 위험한 것은 **동명이인**이다.
//     인물 노드 id가 `person:<이름>`이라 회차를 넓히면 다른 사람이 한 노드로 합쳐진다.
//     그리고 선관위 자료는 `importSeed`가 **verified=1**로 넣는다 — 사실층이고 AI가 바로 인용한다.
//     이름만 보고 합치면 "김성호는 1998년 군의원이었고 2026년 군수 후보였다" 같은
//     **없던 사람**이 만들어진다. 지어내지 않는다는 약속이 정면으로 깨지는 자리다.
//
//   그래서 규칙은 하나다: **가를 근거(생년월일)가 어긋나면 사실층에 넣지 않는다.**
//     · 생년월일이 하나로 모이면 → `person:<이름>` 보강(종전과 같은 id라 기사 노드와 이어진다)
//     · 둘 이상으로 갈리면    → `person:<이름>#<생년월일>`을 **verified=0**으로 격리하고
//                              `person:<이름>`은 건드리지 않는다. 사람이 가를 때까지 사실층에 없다.

import { tidy, parseCareers, districtOf, partyOrgId, type NecCandidate } from "./nec_import";

/** 부르는 쪽이 선거 종류를 붙여 넘긴다 — 종류 코드는 선거 목록에서 읽으므로 여기서 짐작하지 않는다. */
export interface CandidateWithKind extends NecCandidate { kind?: string }

/** 출마 한 번. 인물 KG의 뼈대 — 언제 무슨 선거에 어느 정당으로 나왔는가. */
export interface Run {
  sgId: string;
  kind: string;
  district?: string;
  party?: string;
  giho?: string;
  job?: string;
  /** 생년월일이 없어 **이름만으로** 붙인 기록. 짐작이라는 표시를 남겨 되짚을 수 있게 한다. */
  assumed?: true;
  /** 당락. 당선자 목록을 받은 회차에만 채운다 — 없으면 '모름'이지 낙선이 아니다. */
  result?: "당선" | "낙선";
}

export interface Career { tense: string | null; text: string }

export interface PersonGroup {
  name: string;
  /** "" = 자료에 없음. 있는 것만 가르는 근거로 쓴다. */
  birthday: string;
  hanja?: string;
  gender?: string;
  runs: Run[];        // 오래된 회차부터
  parties: string[];  // 최신 회차부터, 중복 제거
  careers: Career[];
}

/** 이름은 같은데 생년월일이 갈린 사람들. 사실층에 넣지 않는다. */
export interface Ambiguous {
  name: string;
  reason: "생년월일 다름";
  people: PersonGroup[];
}

/** 동명이인 격리 노드 id — `#` 뒤가 가르는 근거다. */
export const dupPersonId = (name: string, birthday: string) => `person:${name}#${birthday || "생년미상"}`;

const put = (v: string | undefined) => {
  const s = tidy(v);
  return s && s !== "미기재" ? s : undefined;
};

const oldestFirst = (a: Run, b: Run) => a.sgId.localeCompare(b.sgId);

/** 후보자 한 줄 → 출마 기록. */
function toRun(c: CandidateWithKind): Run {
  const r: Run = { sgId: tidy(c.sgId) || "?", kind: tidy(c.kind) || "?" };
  const district = districtOf(c.sggName) || put(c.sggName);
  if (district) r.district = district;
  const party = put(c.jdName);
  if (party) r.party = party;
  const giho = put(c.giho);
  if (giho) r.giho = giho;
  const job = put(c.job);
  if (job) r.job = job;
  return r;
}

/** 후보자 여러 줄 → 한 사람. 회차마다 늘어나는 것(경력·정당)은 합친다. */
function toGroup(name: string, birthday: string, cands: CandidateWithKind[], markAssumed = false): PersonGroup {
  const runs = cands.map((c) => {
    const r = toRun(c);
    // 생년월일이 없어 **이름만으로** 이 사람에게 붙인 회차 — 짐작이라는 표시를 남긴다.
    if (markAssumed && !put(c.birthday)) r.assumed = true;
    return r;
  }).sort(oldestFirst);
  // 경력은 회차마다 늘어난다. 최신 기록에 적힌 순서를 그대로 쓰고, 옛 회차에만 있는 줄을 뒤에 붙인다.
  const careers: Career[] = [];
  const seenCareer = new Set<string>();
  // 정당은 **최신 회차 것이 먼저** 와야 '지금 어디 소속인가'를 읽기 쉽다.
  const parties: string[] = [];
  const newestFirst = [...cands].sort((a, b) => tidy(b.sgId).localeCompare(tidy(a.sgId)));
  for (const c of newestFirst) {
    const p = put(c.jdName);
    if (p && !parties.includes(p)) parties.push(p);
    for (const cr of parseCareers(c)) {
      const key = cr.text.replace(/\s+/g, "");
      if (seenCareer.has(key)) continue;
      seenCareer.add(key);
      careers.push(cr);
    }
  }
  const g: PersonGroup = { name, birthday, runs, parties, careers };
  const withBirthday = cands.find((c) => put(c.birthday));
  const hanja = put(withBirthday?.hanjaName) ?? put(cands.find((c) => put(c.hanjaName))?.hanjaName);
  const gender = put(withBirthday?.gender) ?? put(cands.find((c) => put(c.gender))?.gender);
  if (hanja) g.hanja = hanja;
  if (gender) g.gender = gender;
  return g;
}

export interface GroupResult { people: PersonGroup[]; ambiguous: Ambiguous[] }

/**
 * 후보자 목록 → 사람별로 모으기(순수).
 *
 *   생년월일이 가르는 근거다:
 *     · 한 이름에 알려진 생년월일이 **0개** → 충돌 근거가 없으므로 한 사람으로 본다.
 *     · **1개**  → 생년월일 없는 기록도 그 사람으로 붙이고 `assumed`를 남긴다.
 *                 두 사람이라는 증거가 없고, 태안군 규모에서 같은 이름의 반복 출마는 대개 한 사람이다.
 *     · **2개 이상** → 짐작하지 않는다. 생년월일별로 갈라 전부 격리한다(모르는 기록도 따로 세운다).
 */
export function groupCandidates(items: CandidateWithKind[]): GroupResult {
  const byName = new Map<string, CandidateWithKind[]>();
  for (const c of items) {
    const name = tidy(c.name);
    if (!name) continue;
    const list = byName.get(name) ?? [];
    list.push(c);
    byName.set(name, list);
  }

  const people: PersonGroup[] = [];
  const ambiguous: Ambiguous[] = [];
  for (const [name, cands] of byName) {
    const birthdays = [...new Set(cands.map((c) => put(c.birthday)).filter(Boolean) as string[])].sort();

    if (birthdays.length <= 1) {
      people.push(toGroup(name, birthdays[0] ?? "", cands, birthdays.length === 1));
      continue;
    }
    // 갈린다 — 생년월일별로 세우고, 모르는 기록은 어느 쪽에도 붙이지 않고 따로 세운다.
    const parts: PersonGroup[] = [];
    for (const b of birthdays) {
      parts.push(toGroup(name, b, cands.filter((c) => put(c.birthday) === b)));
    }
    const unknown = cands.filter((c) => !put(c.birthday));
    if (unknown.length) parts.push(toGroup(name, "", unknown));
    ambiguous.push({ name, reason: "생년월일 다름", people: parts });
  }
  return { people: people.sort((a, b) => a.name.localeCompare(b.name)), ambiguous };
}

const SOURCE = (sgIds: string[]) => `중앙선관위 후보자등록(${sgIds.join("·")})`;

interface SeedNode { id: string; type: string; name: string; aliases?: string; attrs?: unknown; source: string }
interface SeedEdge { id: string; src_id: string; rel: string; dst_id: string; attrs?: unknown; source: string }

/** 사람 → 노드 속성. 빈 값은 넣지 않는다(빈 칸을 사실처럼 보이게 하지 않는다). */
function toAttrs(g: PersonGroup) {
  const a: Record<string, unknown> = {
    runs: g.runs,
    elections: g.runs.map((r) => r.sgId),
  };
  if (g.birthday) a.birthday = g.birthday;
  if (g.hanja) a.hanja = g.hanja;
  if (g.gender) a.gender = g.gender;
  if (g.parties.length) { a.party = g.parties[0]; a.parties = g.parties; }
  const last = g.runs[g.runs.length - 1];
  if (last?.district) a.district = last.district;
  if (last?.giho) a.giho = last.giho;
  if (g.careers.length) a.careers = g.careers;
  return a;
}

/**
 * 사실층 시드(verified=1로 들어간다).
 *   ⚠ **격리된 동명이인은 여기 넣지 않는다** — `person:<이름>`을 건드리지도 않는다.
 */
export function toHistorySeed(g: GroupResult): { nodes: SeedNode[]; edges: SeedEdge[] } {
  const nodes: SeedNode[] = [];
  const edges: SeedEdge[] = [];
  const parties = new Set<string>();

  for (const p of g.people) {
    const src = SOURCE(p.runs.map((r) => r.sgId));
    const pid = `person:${p.name}`;
    nodes.push({ id: pid, type: "person", name: p.name, attrs: toAttrs(p), source: src });

    // 정당은 회차마다 달라진다 — 정당별로 한 줄씩 잇고 **언제 기준인지** 남긴다.
    for (const party of p.parties) {
      const partyId = partyOrgId(party);
      if (!partyId) continue;                       // 무소속은 조직이 아니다
      if (!parties.has(partyId)) {
        parties.add(partyId);
        nodes.push({ id: partyId, type: "org", name: party, aliases: party, source: src });
      }
      const years = [...new Set(p.runs.filter((r) => r.party === party).map((r) => r.sgId.slice(0, 4)))];
      edges.push({
        id: `${pid}--belongs_to--${partyId}`,
        src_id: pid, rel: "belongs_to", dst_id: partyId,
        attrs: { role: "소속 정당", years: years.join("·"), evidence: `${years.join("·")} 후보자 등록` },
        source: src,
      });
    }
  }
  // 정당 노드가 인물보다 먼저 들어가야 엣지가 붙는다(엣지는 양끝 노드를 요구한다).
  nodes.sort((a, b) => (a.type === b.type ? 0 : a.type === "org" ? -1 : 1));
  return { nodes, edges };
}

/**
 * 격리 노드(**verified=0**으로 따로 쓴다).
 *   사람이 가를 때까지 사실층에 없다 — AI 답변 근거로도 쓰이지 않는다.
 */
export function toQuarantineNodes(g: GroupResult): SeedNode[] {
  const out: SeedNode[] = [];
  for (const a of g.ambiguous) {
    for (const p of a.people) {
      out.push({
        id: dupPersonId(p.name, p.birthday),
        type: "person",
        name: p.name,
        attrs: { ...toAttrs(p), birthday: p.birthday, sameNameCount: a.people.length, ambiguousReason: a.reason },
        source: SOURCE(p.runs.map((r) => r.sgId)),
      });
    }
  }
  return out;
}

// ── 화면용 —— 저장된 속성을 인물 페이지가 쓰기 좋은 모양으로 읽는다. ────────────────
//   당진시대 인물 화면과 같은 정보: 이름·한자·생년 / 출마 N회·당선 N회·활동 기간 / 출마 이력 표.

export interface CandidacyRun {
  sgId: string; year: string; date: string;
  kind: string; district?: string; party?: string; job?: string;
  result?: "당선" | "낙선";
  /** 생년월일이 없어 이름만으로 붙인 회차 — 화면에서 '추정'으로 표시할 수 있게. */
  assumed?: boolean;
}

export interface NecInfo {
  birthday?: string; birthYear?: string; hanja?: string; gender?: string;
  party?: string; parties?: string[];
  careers?: Career[];
  runs: CandidacyRun[];
  total: number;
  /** 당선 횟수. **결과를 모르는 회차는 세지 않는다** — 모름은 낙선이 아니다. */
  wins: number;
  span?: string;
  /** 동명이인 격리 노드면 몇 명으로 갈렸는지. */
  sameNameCount?: number;
}

const dashDate = (sgId: string) =>
  /^\d{8}$/.test(sgId) ? `${sgId.slice(0, 4)}-${sgId.slice(4, 6)}-${sgId.slice(6, 8)}` : sgId;

/** 저장된 attrs_json → 화면용 정보(순수). 선관위 자료가 없는 인물이면 null. */
export function readNecInfo(attrsJson: string | null | undefined): NecInfo | null {
  if (!attrsJson) return null;
  let a: Record<string, unknown>;
  try { a = JSON.parse(attrsJson) as Record<string, unknown>; } catch { return null; }
  if (!a || typeof a !== "object") return null;

  const raw = Array.isArray(a.runs) ? (a.runs as Run[]) : [];
  const birthday = typeof a.birthday === "string" ? a.birthday : undefined;
  const hanja = typeof a.hanja === "string" ? a.hanja : undefined;
  const careers = Array.isArray(a.careers) ? (a.careers as Career[]) : undefined;
  // 출마 이력도 생년도 한자도 없으면 선관위에서 온 인물이 아니다.
  if (!raw.length && !birthday && !hanja && !careers?.length) return null;

  const runs: CandidacyRun[] = raw.map((r) => ({
    sgId: r.sgId, year: String(r.sgId ?? "").slice(0, 4), date: dashDate(String(r.sgId ?? "")),
    kind: r.kind, district: r.district, party: r.party, job: r.job,
    result: r.result, assumed: r.assumed,
  }));
  const years = runs.map((r) => r.year).filter(Boolean).sort();
  const span = years.length ? (years[0] === years[years.length - 1] ? years[0] : `${years[0]}~${years[years.length - 1]}`) : undefined;

  const info: NecInfo = {
    runs, total: runs.length,
    wins: runs.filter((r) => r.result === "당선").length,
  };
  if (birthday) { info.birthday = birthday; info.birthYear = birthday.slice(0, 4); }
  if (hanja) info.hanja = hanja;
  if (typeof a.gender === "string") info.gender = a.gender;
  if (typeof a.party === "string") info.party = a.party;
  if (Array.isArray(a.parties)) info.parties = a.parties as string[];
  if (careers?.length) info.careers = careers;
  if (span) info.span = span;
  if (typeof a.sameNameCount === "number") info.sameNameCount = a.sameNameCount;
  return info;
}
