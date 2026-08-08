import { describe, it, expect } from "vitest";
import { detectOntologyEntity, formatOntologyFacts, type OntoNode, type OntoEdge } from "../src/kg/ontology_evidence";

const NODES: OntoNode[] = [
  { id: "org:taean-gov", type: "org", name: "태안군청", aliases: "태안군청,군청", attrs_json: '{"cat":"행정"}' },
  { id: "event:fest-tulip", type: "event", name: "태안튤립축제", aliases: "태안튤립축제,튤립축제,태안꽃축제", attrs_json: '{"kind":"축제"}' },
  { id: "event:oilspill-2007", type: "event", name: "태안 기름유출 사고", aliases: "허베이스피릿,기름유출", attrs_json: '{"kind":"재난","date":"2007-12-07","ref":"허베이스피릿호"}' },
  { id: "policy:garolim-tidal", type: "policy", name: "가로림만 조력발전", aliases: "가로림만,조력발전", attrs_json: '{"kind":"에너지","status":"무산"}' },
];

describe("detectOntologyEntity", () => {
  it("별칭으로 개체 감지", () => {
    expect(detectOntologyEntity("튤립축제 누가 주관해?", NODES)?.id).toBe("event:fest-tulip");
    expect(detectOntologyEntity("태안 기름유출이 뭐야", NODES)?.id).toBe("event:oilspill-2007");
  });
  it("최장 별칭 우선(군청 vs 태안튤립축제)", () => {
    expect(detectOntologyEntity("태안군청이 태안튤립축제를 주관?", NODES)?.id).toBe("event:fest-tulip");
  });
  it("매칭 없으면 null", () => {
    expect(detectOntologyEntity("오늘 날씨 어때", NODES)).toBeNull();
  });
});

describe("formatOntologyFacts", () => {
  const tulip = NODES[1];
  const edges: OntoEdge[] = [
    { rel: "hosts", src_id: "org:taean-gov", dst_id: "event:fest-tulip", src_name: "태안군청", dst_name: "태안튤립축제" },
    { rel: "held_at", src_id: "event:fest-tulip", dst_id: "place:koreaflowerpark", src_name: "태안튤립축제", dst_name: "코리아플라워파크" },
  ];
  it("사건 관점: 주관(도착)·개최지(출발)", () => {
    const t = formatOntologyFacts(tulip, edges)!;
    expect(t).toContain("주관: 태안군청");
    expect(t).toContain("개최지: 코리아플라워파크");
    expect(t).toContain("[확인된 사실 · 지식그래프]");
  });

  it("조직 관점: 주관 행사 묶음", () => {
    const gov = NODES[0];
    const gedges: OntoEdge[] = [
      { rel: "hosts", src_id: "org:taean-gov", dst_id: "event:fest-tulip", src_name: "태안군청", dst_name: "태안튤립축제" },
      { rel: "hosts", src_id: "org:taean-gov", dst_id: "event:fest-nakjo", src_name: "태안군청", dst_name: "태안낙조축제" },
      { rel: "drives", src_id: "org:taean-gov", dst_id: "policy:garolim-tidal", src_name: "태안군청", dst_name: "가로림만 조력발전" },
    ];
    const t = formatOntologyFacts(gov, gedges)!;
    expect(t).toContain("주관 행사: 태안튤립축제·태안낙조축제");
    expect(t).toContain("추진 정책: 가로림만 조력발전");
  });

  it("엣지 없어도 메타(날짜·출처)만으로 근거 생성", () => {
    const t = formatOntologyFacts(NODES[2], [])!;
    expect(t).toContain("태안 기름유출 사고(재난, 2007-12-07, 허베이스피릿호)");
  });

  it("메타·엣지 모두 없으면 null", () => {
    const bare: OntoNode = { id: "x", type: "org", name: "무명", aliases: null, attrs_json: "{}" };
    expect(formatOntologyFacts(bare, [])).toBeNull();
  });

  it("정책: 상태(무산) 메타 + 추진(도착)", () => {
    const gar = NODES[3];
    const t = formatOntologyFacts(gar, [{ rel: "drives", src_id: "org:taean-gov", dst_id: "policy:garolim-tidal", src_name: "태안군청", dst_name: "가로림만 조력발전" }])!;
    expect(t).toContain("무산");
    expect(t).toContain("추진: 태안군청");
  });
});
