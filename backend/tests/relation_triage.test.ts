import { describe, it, expect } from "vitest";
import { triageRelation, countTriage } from "@/kg/relation_triage";

// 아래 근거 문장은 2026-08-20 D1에서 그대로 가져온 실제 값이다.
describe("분류기가 모른다고 한 것", () => {
  it("'특정하기 어렵다'는 사람이 볼 필요가 없다", () => {
    expect(triageRelation("기타", "두 인물이 함께 등장한 기사 제목만으로는 관계를 특정하기 어렵습니다.")).toBe("unsure");
    expect(triageRelation("기타", "두 인물이 함께 등장하는 제목이 없어 관계를 특정하기 어렵습니다.")).toBe("unsure");
  });

  it("'명확하게 드러나지 않아'도 마찬가지", () => {
    expect(triageRelation("기타", "가세로와 문재인이 함께 등장하는 맥락이 명확하게 드러나지 않아 관계를 특정하기 어렵다.")).toBe("unsure");
  });

  it("'가능성이 높으나'처럼 자신 없는 말도 뺀다", () => {
    expect(triageRelation("전임·후임", "윤여준이 신임 교육장으로 발령받았다는 기사 제목이 있어 전임자와 후임자 관계일 가능성이 높으나, 이성엽이 직접적으로 언급되지 않아 명확한 관계 파악이 어렵습니다.")).toBe("unsure");
  });
});

describe("라벨과 근거가 어긋난 것", () => {
  // 화면에서 눈에 띈 실제 사례 — 근거는 '대립'인데 라벨은 '소속·상하'였다.
  it("근거가 대립인데 라벨이 다르면 재분류 대상", () => {
    expect(triageRelation("소속·상하", "두 인물이 총선에서 경쟁하는 후보로 등장하며 서로 대립하는 양상을 보이기 때문이다."))
      .toBe("mismatch");
  });

  it("협력 라벨인데 근거가 경쟁이면 재분류 대상", () => {
    expect(triageRelation("협력·동료", "두 후보의 지지율 순위가 비교되는 등 경쟁 관계에 있음을 보여준다."))
      .toBe("mismatch");
  });

  it("라벨이 대립·갈등이면 어긋난 것이 아니다", () => {
    expect(triageRelation("대립·갈등", "정광섭 심문 거부, 두 의원이 해결해야 일침. 갈등이 이어지고 있다."))
      .toBe("review");
  });

  // 한 문장에 대립·협력이 섞이면 맥락이 복잡한 것이라 사람에게 넘긴다.
  it("협력과 경쟁이 함께 있으면 사람이 본다", () => {
    expect(triageRelation("협력·동료", "두 인물 모두 민주당 소속으로 함께 활동하나 당내 경선에서는 경쟁했다. 협력 관계이기도 하다."))
      .toBe("review");
  });
});

describe("사람이 봐야 하는 것", () => {
  it("근거가 사실을 단정하면 검토 대상", () => {
    expect(triageRelation("소속·상하", "류재환은 태안교육지원청 교육장이고, 이성엽은 태안고등학교 교장으로, 교육지원청은 학교를 관리·감독하는 상위 기관에 해당한다."))
      .toBe("review");
  });

  it("근거가 아예 없으면 사람이 본다", () => {
    expect(triageRelation("협력·동료", null)).toBe("review");
    expect(triageRelation("협력·동료", "  ")).toBe("review");
  });
});

describe("갈래별 집계", () => {
  it("화면에 '몇 건을 자동으로 걸렀는지' 보여줄 수 있다", () => {
    const c = countTriage([
      { reltype: "기타", reason: "관계를 특정하기 어렵습니다." },
      { reltype: "소속·상하", reason: "서로 대립하는 양상을 보이기 때문이다." },
      { reltype: "소속·상하", reason: "교육지원청은 학교를 관리·감독하는 상위 기관이다." },
    ]);
    expect(c).toEqual({ review: 1, unsure: 1, mismatch: 1 });
  });
});
