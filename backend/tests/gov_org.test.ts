import { describe, it, expect } from "vitest";
import { parseOrgTree, toSeed, skipForeignNodes, aliasesFor, deptId, GOV_ID, COUNCIL_ID, SOURCE } from "@/kg/gov_org";

// 군청 페이지의 실제 마크업 골격(basic_box > inner > h2 + box_info > a).
const box = (group: string, items: Array<[string, string]>) => `
<div class="basic_box type3">
  <div class="inner">
    <h2>${group}</h2>
    <div class="box_info">
      ${items.map(([name, href]) => `<span class="button basic"><span class="arrow_b"><a href="${href}">${name}</a></span></span>`).join("")}
    </div>
  </div>
</div>`;

const D = (code: string) => `/prog/deptPerson/kor/sub05_01_02_02/${code}/list.do`;

describe("군청 조직도 파싱", () => {
  it("실·국은 그 자체가 조직이고, 소속 과는 그 밑에 달린다", () => {
    const orgs = parseOrgTree(box("행정안전실", [
      ["행정안전실", D("100")], ["기획예산담당관", D("101")], ["재무과", D("102")],
    ]));
    expect(orgs).toHaveLength(3);
    expect(orgs[0]).toMatchObject({ id: deptId("100"), name: "행정안전실", parentId: GOV_ID });
    expect(orgs[1]).toMatchObject({ name: "기획예산담당관", parentId: deptId("100") });
    expect(orgs[2]).toMatchObject({ name: "재무과", parentId: deptId("100") });
  });

  // '사업소'·'읍면'은 화면상의 분류 딱지일 뿐 실체가 없다 → 자식을 군청 직속으로.
  it("분류 딱지(사업소·읍면)는 조직으로 만들지 않고 자식을 군청 직속으로 단다", () => {
    const orgs = parseOrgTree(box("읍면", [["태안읍", D("200")], ["안면읍", D("201")]]));
    expect(orgs).toHaveLength(2);
    expect(orgs.every((o) => o.parentId === GOV_ID)).toBe(true);
    expect(orgs.map((o) => o.name)).toEqual(["태안읍", "안면읍"]);
  });

  it("의회 소속은 군청이 아니라 태안군의회 밑에 단다", () => {
    const orgs = parseOrgTree(box("의회", [["의회사무과", D("300")]]));
    expect(orgs[0]).toMatchObject({ name: "의회사무과", parentId: COUNCIL_ID });
  });

  // 군수·부군수는 조직이 아니라 직위(office)다 — org로 만들면 온톨로지가 뒤틀린다.
  it("군수·부군수는 조직이 아니므로 제외한다", () => {
    expect(parseOrgTree(box("군수", [["군수", D("1")]]))).toHaveLength(0);
    expect(parseOrgTree(box("부군수", [["부군수", D("2")]]))).toHaveLength(0);
  });

  // 보건의료원·농업기술센터는 링크가 deptPerson 규격이 아니라 부서코드가 없다.
  it("부서코드가 없어도 알려진 기관은 고정 id로 싣는다", () => {
    const orgs = parseOrgTree(box("직속기관", [
      ["보건의료원", "/kor/sub05_05_02.do"], ["농업기술센터", "/farm/sub01_04.do"],
    ]));
    // 보건의료원은 이미 org:taean-health로 있으므로 그 id에 붙어야 한다(노드 갈라짐 방지).
    expect(orgs.map((o) => o.id)).toEqual(["org:taean-health", "org:taean-agri-center"]);
    expect(orgs.every((o) => o.parentId === GOV_ID && o.code === null)).toBe(true);
  });

  // id를 못 정하면 지어내지 않고 버린다(지어내기 방지).
  it("코드도 없고 알려지지도 않은 링크는 버린다", () => {
    expect(parseOrgTree(box("사업소", [["처음보는센터", "/kor/etc.do"]]))).toHaveLength(0);
  });

  it("같은 부서가 두 번 나와도 한 번만 싣는다", () => {
    const html = box("사업소", [["환경관리센터", D("400")]]) + box("읍면", [["환경관리센터", D("400")]]);
    expect(parseOrgTree(html)).toHaveLength(1);
  });
});

describe("적재 시드", () => {
  const orgs = parseOrgTree(box("산업건설국", [["산업건설국", D("500")], ["농정과", D("501")]]));

  it("노드마다 출처가 붙는다(검증 데이터 필수 조건)", () => {
    expect(toSeed(orgs).nodes.every((n) => !!n.source && n.type === "org")).toBe(true);
  });

  it("part_of 엣지가 부서마다 하나씩 생긴다", () => {
    const { edges } = toSeed(orgs);
    expect(edges).toHaveLength(2);
    expect(edges[1]).toMatchObject({ src_id: deptId("501"), rel: "part_of", dst_id: deptId("500") });
  });

  it("부서코드는 속성으로 보존한다(이름이 바뀌어도 따라가려면 필요)", () => {
    expect(toSeed(orgs).nodes[0].attrs).toEqual({ deptCode: "500" });
  });
});

describe("별칭", () => {
  // 기사에는 '태안군 농정과'처럼 앞에 지역이 붙어 나온다.
  it("과·담당관은 지역을 붙인 형태를 함께 등록한다", () => {
    expect(aliasesFor("농정과").split(",")).toEqual(["농정과", "태안군 농정과", "태안군농정과"]);
  });

  it("읍·면은 이미 완결형이라 덧붙이지 않는다", () => {
    expect(aliasesFor("태안읍")).toBe("태안읍");
    expect(aliasesFor("근흥면")).toBe("근흥면");
  });
});

describe("기존 노드 보호", () => {
  const seed = toSeed(parseOrgTree(box("직속기관", [
    ["보건의료원", "/kor/sub05_05_02.do"], ["농업기술센터", "/farm/sub01_04.do"],
  ])));

  // 사람이 '태안군보건의료원'으로 다듬어 둔 이름을 조직도의 짧은 이름이 밀어내면 안 된다.
  it("다른 출처로 이미 있는 노드는 갱신 대상에서 뺀다", () => {
    const r = skipForeignNodes(seed, [{ id: "org:taean-health", source: "수기 시드" }]);
    expect(r.nodes.map((n) => n.id)).toEqual(["org:taean-agri-center"]);
    expect(r.skipped).toEqual(["org:taean-health"]);
  });

  // 관계는 새로 이어야 한다 — 노드를 안 건드리는 것과 계층을 안 잇는 것은 다르다.
  it("노드를 건너뛰어도 part_of 관계는 그대로 잇는다", () => {
    expect(skipForeignNodes(seed, [{ id: "org:taean-health", source: "수기 시드" }]).edges).toHaveLength(2);
  });

  // 이 동기화가 만든 부서는 인사이동 반영을 위해 갱신해야 한다.
  it("같은 출처면 갱신 대상으로 남긴다", () => {
    const r = skipForeignNodes(seed, [{ id: "org:taean-health", source: SOURCE }]);
    expect(r.skipped).toEqual([]);
    expect(r.nodes).toHaveLength(2);
  });
});
