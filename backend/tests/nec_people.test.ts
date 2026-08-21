import { describe, it, expect } from "vitest";
import { groupCandidates, toHistorySeed, toQuarantineNodes, dupPersonId, readNecInfo } from "@/kg/nec_people";

// 회차를 넘나드는 후보자 목록. kind는 부르는 쪽이 붙인다(선거 종류 코드는 목록에서 읽으므로).
const C = (o: Partial<Parameters<typeof groupCandidates>[0][number]>) => ({
  name: "홍길동", sgId: "20260603", kind: "군의원", birthday: "19600101",
  sggName: "태안군가선거구", jdName: "더불어민주당", giho: "1", ...o,
});

describe("같은 사람 모으기", () => {
  // 진태구 군수는 2002·2006·2011·2014년에 나온다. 회차마다 노드를 덮어쓰면 이력이 사라진다.
  it("여러 회차에 나온 같은 사람은 한 명으로 모으고 출마 이력을 쌓는다", () => {
    const { people } = groupCandidates([
      C({ name: "진태구", sgId: "20020613", kind: "군수", jdName: "자유민주연합" }),
      C({ name: "진태구", sgId: "20060531", kind: "군수", jdName: "국민중심당" }),
      C({ name: "진태구", sgId: "20140604", kind: "군수", jdName: "무소속" }),
    ]);
    expect(people).toHaveLength(1);
    expect(people[0].runs.map((r) => r.sgId)).toEqual(["20020613", "20060531", "20140604"]); // 오래된 것부터
    expect(people[0].runs.map((r) => r.party)).toEqual(["자유민주연합", "국민중심당", "무소속"]);
  });

  it("정당 이력을 남긴다 — 최신이 앞", () => {
    const { people } = groupCandidates([
      C({ name: "진태구", sgId: "20020613", jdName: "자유민주연합" }),
      C({ name: "진태구", sgId: "20140604", jdName: "무소속" }),
    ]);
    expect(people[0].parties).toEqual(["무소속", "자유민주연합"]);
  });

  it("경력은 회차마다 늘어나므로 합치고 같은 줄은 한 번만 담는다", () => {
    const { people } = groupCandidates([
      C({ sgId: "20220601", career1: "(전)  태안군의회  의원" }),
      C({ sgId: "20260603", career1: "(전)  태안군의회  의원", career2: "(현)  태안군체육회  이사" }),
    ]);
    expect(people[0].careers.map((c) => c.text)).toEqual(["태안군의회 의원", "태안군체육회 이사"]);
  });

  it("선거 종류가 달라도 같은 사람이면 한 명이다", () => {
    const { people } = groupCandidates([
      C({ name: "정광섭", kind: "군의원", sgId: "20140604" }),
      C({ name: "정광섭", kind: "도의원", sgId: "20220601" }),
    ]);
    expect(people).toHaveLength(1);
    expect(people[0].runs.map((r) => r.kind)).toEqual(["군의원", "도의원"]);
  });
});

describe("동명이인 — 합치지 않는다", () => {
  // 선관위 자료는 verified=1로 들어가 AI가 바로 인용한다.
  //   이름만 보고 합치면 "김성호는 1998년 군의원이었고 2026년 군수 후보였다"는 거짓이 만들어진다.
  it("생년월일이 다르면 사실층에 넣지 않는다", () => {
    const { people, ambiguous } = groupCandidates([
      C({ name: "김성호", birthday: "19580301", sgId: "19980604" }),
      C({ name: "김성호", birthday: "19710815", sgId: "20260603" }),
    ]);
    expect(people).toHaveLength(0);
    expect(ambiguous).toHaveLength(1);
    expect(ambiguous[0].people.map((p) => p.birthday)).toEqual(["19580301", "19710815"]);
  });

  it("격리된 사람은 이름 노드를 건드리지 않는다", () => {
    const g = groupCandidates([
      C({ name: "김성호", birthday: "19580301" }),
      C({ name: "김성호", birthday: "19710815" }),
    ]);
    const seed = toHistorySeed(g);
    expect(seed.nodes.some((n) => n.id === "person:김성호")).toBe(false);
  });

  it("격리 노드는 생년월일로 갈라 따로 만든다", () => {
    const g = groupCandidates([
      C({ name: "김성호", birthday: "19580301" }),
      C({ name: "김성호", birthday: "19710815" }),
    ]);
    const q = toQuarantineNodes(g);
    expect(q.map((n) => n.id)).toEqual([dupPersonId("김성호", "19580301"), dupPersonId("김성호", "19710815")]);
    expect(q.every((n) => n.type === "person")).toBe(true);
  });

  it("격리 노드에는 왜 갈렸는지 남긴다", () => {
    const g = groupCandidates([
      C({ name: "김성호", birthday: "19580301" }),
      C({ name: "김성호", birthday: "19710815" }),
    ]);
    const attrs = toQuarantineNodes(g)[0].attrs as { sameNameCount: number; birthday: string };
    expect(attrs).toMatchObject({ birthday: "19580301", sameNameCount: 2 });
  });

  it("다른 이름은 영향을 받지 않는다", () => {
    const { people, ambiguous } = groupCandidates([
      C({ name: "김성호", birthday: "19580301" }),
      C({ name: "김성호", birthday: "19710815" }),
      C({ name: "정광섭", birthday: "19620202" }),
    ]);
    expect(people.map((p) => p.name)).toEqual(["정광섭"]);
    expect(ambiguous.map((a) => a.name)).toEqual(["김성호"]);
  });
});

describe("생년월일이 없는 옛 기록", () => {
  // 가를 근거가 없다. 같은 이름에 생년월일이 딱 하나만 알려져 있으면 같은 사람으로 본다 —
  //   두 사람이라는 **증거가 없고**, 태안군 규모에서 같은 이름이 여러 번 출마하면 대개 한 사람이다.
  //   대신 짐작이라는 표시를 남겨 나중에 되짚을 수 있게 한다.
  it("알려진 생년월일이 하나뿐이면 붙이고 짐작 표시를 남긴다", () => {
    const { people, ambiguous } = groupCandidates([
      C({ name: "윤형상", birthday: "", sgId: "19950627" }),
      C({ name: "윤형상", birthday: "19450101", sgId: "19980604" }),
    ]);
    expect(ambiguous).toHaveLength(0);
    expect(people[0].birthday).toBe("19450101");
    expect(people[0].runs.find((r) => r.sgId === "19950627")?.assumed).toBe(true);
    expect(people[0].runs.find((r) => r.sgId === "19980604")?.assumed).toBeUndefined();
  });

  it("생년월일이 둘 이상 알려져 있으면 짐작하지 않고 전부 격리한다", () => {
    const { people, ambiguous } = groupCandidates([
      C({ name: "김성호", birthday: "" }),
      C({ name: "김성호", birthday: "19580301" }),
      C({ name: "김성호", birthday: "19710815" }),
    ]);
    expect(people).toHaveLength(0);
    expect(ambiguous[0].people).toHaveLength(3);   // 모르는 것도 따로 세운다
  });

  it("아무도 생년월일이 없으면 한 명으로 본다(충돌 근거가 없다)", () => {
    const { people, ambiguous } = groupCandidates([
      C({ name: "조철행", birthday: "", sgId: "19950627" }),
      C({ name: "조철행", birthday: "", sgId: "19980604" }),
    ]);
    expect(ambiguous).toHaveLength(0);
    expect(people).toHaveLength(1);
    expect(people[0].birthday).toBe("");
  });
});

describe("적재 시드", () => {
  const g = groupCandidates([
    C({ name: "정광섭", birthday: "19620202", sgId: "20140604", kind: "군의원", jdName: "새누리당" }),
    C({ name: "정광섭", birthday: "19620202", sgId: "20220601", kind: "도의원", jdName: "국민의힘" }),
  ]);
  const seed = toHistorySeed(g);

  it("인물 id는 기존 형식을 따른다 — 기사에서 들어온 노드와 같은 id", () => {
    expect(seed.nodes.find((n) => n.type === "person")?.id).toBe("person:정광섭");
  });

  it("출마 이력을 속성에 담는다", () => {
    const attrs = seed.nodes.find((n) => n.type === "person")!.attrs as { runs: unknown[]; elections: string[] };
    expect(attrs.runs).toHaveLength(2);
    expect(attrs.elections).toEqual(["20140604", "20220601"]);
  });

  it("정당이 바뀌었으면 정당별로 소속을 잇는다", () => {
    const belongs = seed.edges.filter((e) => e.rel === "belongs_to");
    expect(belongs.map((e) => e.dst_id).sort()).toEqual(["org:party-국민의힘", "org:party-새누리당"]);
  });

  it("소속에 언제 기준인지 남긴다", () => {
    const e = seed.edges.find((x) => x.dst_id === "org:party-새누리당")!;
    expect(e.attrs).toMatchObject({ years: "2014" });
  });

  it("무소속은 정당 노드를 만들지 않는다", () => {
    const s = toHistorySeed(groupCandidates([C({ name: "가세로", jdName: "무소속" })]));
    expect(s.nodes.some((n) => n.id.startsWith("org:party-"))).toBe(false);
    expect(s.edges).toHaveLength(0);
  });

  it("정당 노드가 인물보다 앞선다(엣지는 양끝 노드를 요구한다)", () => {
    expect(seed.nodes[0].type).toBe("org");
  });

  it("모든 노드·엣지에 출처가 붙는다", () => {
    expect(seed.nodes.every((n) => n.source.includes("선관위"))).toBe(true);
    expect(seed.edges.every((e) => e.source.includes("선관위"))).toBe(true);
  });
});

describe("화면용 인물 정보 읽기", () => {
  // 당진시대 인물 화면과 같은 정보 — 이름·한자·생년 / 출마 N회·당선 N회·활동 기간 / 출마 이력 표.
  const attrs = JSON.stringify({
    birthday: "19571120", hanja: "梁基林", gender: "여",
    party: "국민의힘", parties: ["국민의힘", "새누리당"],
    careers: [{ tense: "현", text: "태안군의원" }],
    runs: [
      { sgId: "20140604", kind: "군의원", district: "가선거구", party: "새누리당", job: "정당인", result: "당선" },
      { sgId: "20180613", kind: "군의원", district: "가선거구", party: "국민의힘", result: "당선" },
    ],
  });

  it("생년월일에서 태어난 해를 뽑는다", () => {
    expect(readNecInfo(attrs)!.birthYear).toBe("1957");
  });

  it("출마·당선 횟수와 활동 기간을 센다", () => {
    const n = readNecInfo(attrs)!;
    expect([n.total, n.wins, n.span]).toEqual([2, 2, "2014~2018"]);
  });

  it("선거일을 읽기 좋은 날짜로 바꾼다", () => {
    expect(readNecInfo(attrs)!.runs[0].date).toBe("2014-06-04");
  });

  it("한 번만 나왔으면 기간이 아니라 한 해로 적는다", () => {
    const one = JSON.stringify({ runs: [{ sgId: "20220601", kind: "군수" }] });
    expect(readNecInfo(one)!.span).toBe("2022");
  });

  // 당락을 모르는 회차를 낙선처럼 보이게 하면 안 된다.
  it("결과를 모르는 회차는 당선 횟수에 넣지 않고 모름으로 남긴다", () => {
    const n = readNecInfo(JSON.stringify({ runs: [{ sgId: "19980604", kind: "군의원" }] }))!;
    expect(n.wins).toBe(0);
    expect(n.runs[0].result).toBeUndefined();
  });

  it("선관위 자료가 없는 인물은 null", () => {
    expect(readNecInfo(null)).toBeNull();
    expect(readNecInfo("{}")).toBeNull();
    expect(readNecInfo("깨진 값")).toBeNull();
  });

  it("출마 이력이 없어도 생년·한자만 있으면 보여준다", () => {
    const n = readNecInfo(JSON.stringify({ birthday: "19600101", hanja: "洪吉童" }));
    expect(n).toMatchObject({ birthYear: "1960", hanja: "洪吉童", total: 0 });
  });
});
