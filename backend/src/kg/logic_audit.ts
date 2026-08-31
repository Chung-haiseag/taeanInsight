// 지식그래프 논리 감사 — **논리적으로 불가능한 것만** 센다.
//
// 왜 상시로 도는가: 2026-08-28 감사에서 부군수 23명이 '태안군수'로 떠 있는 걸 찾았는데,
//   추출 코드는 그보다 8일 전에 이미 고쳐져 있었다. **코드는 고쳤고 데이터는 안 따라온** 것이다.
//   사람이 생각날 때만 도는 감사로는 이런 어긋남을 몇 주씩 방치하게 된다.
//
// 무엇을 담는가: 참이면 **반드시 버그**인 것만. '이상해 보인다'는 여기 넣지 않는다 —
//   경고가 늘 켜져 있으면 아무도 안 본다. 실제로 이번에 '별세 후 활동'과
//   '선관위 당선인데 재임 없음'은 정상(사후 언급·질의 오류)이라 뺐다.
//   '접두 잘림'(근거에 '부회장'이 있는데 직함이 '회장')도 뺐다 — 근거에 **남의** 직함이 섞이면
//   멀쩡한 것도 걸린다(15건 중 대부분이 오탐). 그건 tools/kg/recheck-roles.mjs로 **일부러** 돌린다.

export interface LogicCheck {
  key: string;
  label: string;
  /** 위반 건수를 c로 돌려주는 질의. 0이 정상. */
  sql: string;
  /** 왜 이게 불가능한지 — 알림에 함께 실어 보낸다. */
  why: string;
}

const MENTION_COUNTS = "(SELECT node_id, COUNT(*) n FROM kg_mentions GROUP BY node_id)";

export const LOGIC_CHECKS: LogicCheck[] = [
  {
    key: "dangling_edge_src",
    label: "없는 노드를 가리키는 관계(출발점)",
    why: "관계의 양 끝은 반드시 노드여야 한다.",
    sql: "SELECT COUNT(*) c FROM kg_edges e LEFT JOIN kg_nodes n ON n.id=e.src_id WHERE n.id IS NULL",
  },
  {
    key: "dangling_edge_dst",
    label: "없는 노드를 가리키는 관계(도착점)",
    why: "관계의 양 끝은 반드시 노드여야 한다.",
    sql: "SELECT COUNT(*) c FROM kg_edges e LEFT JOIN kg_nodes n ON n.id=e.dst_id WHERE n.id IS NULL",
  },
  {
    key: "self_edge",
    label: "자기 자신과 맺은 관계",
    why: "사람은 자기와 함께 등장하거나 자기에 소속될 수 없다.",
    sql: "SELECT COUNT(*) c FROM kg_edges WHERE src_id=dst_id",
  },
  {
    key: "dangling_mention",
    label: "없는 기사를 가리키는 언급",
    why: "언급의 근거는 반드시 아카이브에 있는 기사여야 한다.",
    sql: "SELECT COUNT(*) c FROM kg_mentions m LEFT JOIN archive_articles a ON a.idxno=m.article_idxno WHERE a.idxno IS NULL",
  },
  {
    key: "ad_mention",
    label: "광고 기사에 걸린 언급",
    why: "광고는 기사가 아니다. 적재 SQL도 COALESCE(is_ad,0)=0을 지킨다(db/067).",
    sql: "SELECT COUNT(*) c FROM kg_mentions m JOIN archive_articles a ON a.idxno=m.article_idxno WHERE COALESCE(a.is_ad,0)=1",
  },
  {
    key: "coappear_over_mentions",
    label: "공동등장 수가 한쪽의 총 등장 수보다 큼",
    why: "둘이 함께 나온 기사는 각자 나온 기사의 부분집합이다. 크면 집계가 어긋난 것이다(파생표 재계산 누락·중복 카운트).",
    sql:
      `SELECT COUNT(*) c FROM kg_edges e ` +
      `JOIN ${MENTION_COUNTS} a ON a.node_id=e.src_id ` +
      `JOIN ${MENTION_COUNTS} b ON b.node_id=e.dst_id ` +
      `WHERE e.rel='coappears' AND CAST(json_extract(e.attrs_json,'$.weight') AS INTEGER) > MIN(a.n,b.n)`,
  },
  {
    key: "affiliation_over_mentions",
    label: "소속 근거 기사 수가 그 사람 총 등장 수보다 큼",
    why:
      "소속을 뽑은 기사는 그 사람이 나온 기사의 부분집합이다. " +
      "이 검사가 가짜 인물을 정확히 짚어냈다 — 손정·김행(줄바꿈으로 잘린 이름)·이다('군의원이다')·안군('태안군').",
    sql:
      `SELECT COUNT(*) c FROM kg_edges e JOIN ${MENTION_COUNTS} a ON a.node_id=e.src_id ` +
      `WHERE e.rel='belongs_to' AND CAST(json_extract(e.attrs_json,'$.count') AS INTEGER) > a.n`,
  },
  {
    key: "orphan_person_edge",
    label: "등장 0건인데 관계만 남은 인물",
    why: "언급을 지우면 거기서 파생된 관계도 같이 지워져야 한다(db/067에서 54명 발생).",
    sql:
      "SELECT COUNT(*) c FROM (SELECT n.id FROM kg_nodes n WHERE n.type='person' " +
      "AND NOT EXISTS(SELECT 1 FROM kg_mentions m WHERE m.node_id=n.id) " +
      "AND EXISTS(SELECT 1 FROM kg_edges e WHERE (e.src_id=n.id OR e.dst_id=n.id) AND e.rel='coappears'))",
  },
  {
    key: "office_term_overlap",
    label: "같은 자리를 두 사람이 겹쳐 맡음",
    why:
      "한 자리에 두 사람이 동시에 앉을 수는 없다. " +
      "db/064가 월 단위 공식 명부(`1대(1989.1~1989.11)`)를 '그 달 1일~말일'로 펼치는 바람에 " +
      "1대 종료(1989-11-30)와 2대 시작(1989-11-01)이 30일 겹쳤다(4쌍). " +
      "⚠ 인수인계 **달**만 겹치는 것은 위반이 아니다 — 월 정밀도로 적힌 두 기간은 " +
      "그 달 안에서 안 겹치게 나눌 수 있다. 어떻게 나눠도 겹치는 것만 센다.",
    sql:
      "WITH t AS (SELECT e.dst_id AS office, CAST(json_extract(e.attrs_json,'$.ordinal') AS INTEGER) AS ord, " +
      "json_extract(e.attrs_json,'$.start') AS s, json_extract(e.attrs_json,'$.end') AS en " +
      "FROM kg_edges e WHERE e.rel='held'), " +
      // 월 정밀도('1989-11')는 폭이 있다 — 시작은 그 달 **말일**까지 늦출 수 있고, 종료는 **1일**까지 당길 수 있다.
      "n AS (SELECT office, ord, " +
      "CASE WHEN length(s)=7 THEN date(s||'-01','+1 month','-1 day') ELSE s END AS max_start, " +
      "CASE WHEN length(en)=7 THEN en||'-01' ELSE en END AS min_end FROM t) " +
      "SELECT COUNT(*) c FROM n a JOIN n b ON a.office=b.office AND a.ord < b.ord " +
      "WHERE a.min_end IS NOT NULL AND b.max_start IS NOT NULL AND a.min_end > b.max_start",
  },
  {
    key: "person_is_org",
    label: "같은 이름이 인물이자 조직으로 등록",
    why: "이원면·원북면·건설과가 인물 노드로도 있었다. 조직이 사람이 될 수는 없다.",
    sql: "SELECT COUNT(*) c FROM kg_nodes p JOIN kg_nodes o ON o.name=p.name AND o.type='org' WHERE p.type='person'",
  },
];

export interface CheckResult { key: string; label: string; count: number | null; why?: string }

export interface AuditSummary {
  ok: boolean;
  total: number;
  /** 위반 있는 검사 — 건수 많은 것부터. */
  failed: CheckResult[];
  /** 질의 자체가 실패한 검사. 0건과 구분해야 한다 — 못 센 것을 정상으로 읽으면 안 된다. */
  errored: CheckResult[];
}

export function summarizeAudit(results: CheckResult[]): AuditSummary {
  const errored = results.filter((r) => r.count === null);
  const failed = results.filter((r) => (r.count ?? 0) > 0).sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  const total = failed.reduce((s, r) => s + (r.count ?? 0), 0);
  return { ok: failed.length === 0 && errored.length === 0, total, failed, errored };
}

/** 검사를 모두 돌린다. 한 검사가 죽어도 나머지는 계속한다(격리). */
export async function runLogicAudit(db: D1Database): Promise<AuditSummary & { results: CheckResult[] }> {
  const results: CheckResult[] = [];
  for (const c of LOGIC_CHECKS) {
    try {
      const row = await db.prepare(c.sql).first<{ c: number }>();
      results.push({ key: c.key, label: c.label, count: Number(row?.c ?? 0), why: c.why });
    } catch {
      results.push({ key: c.key, label: c.label, count: null, why: c.why });
    }
  }
  return { ...summarizeAudit(results), results };
}
