// #27 AI 거버넌스 미들웨어 단위 테스트

import { describe, expect, it } from "vitest";

import { detectPii, hasPii } from "../src/governance/pii";
import { classifySensitiveTopics } from "../src/governance/sensitive_topics";
import { checkPublishGuard, formatLabelBadge } from "../src/governance/ai_label";
import { applyGovernance } from "../src/governance/middleware";

// ---------- PII ----------

describe("PII detection", () => {
  it("주민등록번호 마스킹", () => {
    const r = detectPii("제 주민등록번호는 900101-1234567 입니다");
    expect(r.findings.find((f) => f.kind === "rrn")).toBeTruthy();
    expect(r.masked).toContain("900101-*******");
    expect(r.masked).not.toContain("1234567");
  });

  it("휴대전화 마스킹 (가운데만)", () => {
    const r = detectPii("연락처는 010-1234-5678 입니다");
    expect(r.masked).toContain("010-****-5678");
  });

  it("이메일 마스킹 (앞 2자만)", () => {
    const r = detectPii("문의: chs9182@gmail.com");
    expect(r.masked).toContain("ch***@gmail.com");
  });

  it("신용카드 마스킹", () => {
    const r = detectPii("카드 1234-5678-9012-3456 으로 결제");
    expect(r.masked).toContain("1234-****-****-3456");
  });

  it("주소 동/읍/면은 마스킹", () => {
    const r = detectPii("주소: 충청남도 태안군 안면읍 ");
    expect(r.findings.find((f) => f.kind === "address")).toBeTruthy();
    expect(r.masked).toContain("***");
  });

  it("PII 없는 일반 텍스트는 그대로", () => {
    const text = "안면도 꽃지 해수욕장은 일몰 명소입니다";
    expect(hasPii(text)).toBe(false);
    expect(detectPii(text).findings.length).toBe(0);
  });
});

// ---------- 민감 주제 ----------

describe("Sensitive topics classification", () => {
  it("선거 키워드 → election", () => {
    const r = classifySensitiveTopics("이번 선거에서 후보 김씨는...");
    expect(r.topics.find((t) => t.topic === "election")).toBeTruthy();
    expect(r.blockAiOnly).toBe(true);
    expect(r.requiresHitl).toBe(true);
  });

  it("의료 진단 키워드 → medical", () => {
    const r = classifySensitiveTopics("이 증상은 진단을 받아야 합니다");
    expect(r.topics.find((t) => t.topic === "medical")).toBeTruthy();
  });

  it("정치 인물 → political_figure, blockAiOnly=false (HITL만 필수)", () => {
    const r = classifySensitiveTopics("태안군수 인터뷰 내용");
    const hit = r.topics.find((t) => t.topic === "political_figure");
    expect(hit).toBeTruthy();
    expect(r.blockAiOnly).toBe(false);
    expect(r.requiresHitl).toBe(true);
  });

  it("부동산 투기 자문 → realestate_speculation", () => {
    const r = classifySensitiveTopics("갭투자로 시세 차익을 노리는 방법");
    expect(r.topics.find((t) => t.topic === "realestate_speculation")).toBeTruthy();
  });

  it("일반 관광 기사는 민감 주제 아님", () => {
    const r = classifySensitiveTopics("안면도 꽃지 해수욕장 추천 가이드");
    expect(r.topics).toHaveLength(0);
    expect(r.requiresHitl).toBe(false);
  });
});

// ---------- 발행 가드 ----------

describe("Publish guard", () => {
  it("AI 보조 콘텐츠는 출처 없으면 거부", () => {
    const r = checkPublishGuard({ aiLabel: "ai_assisted", sources: [] });
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("출처");
  });

  it("사람 작성은 출처 없어도 OK", () => {
    const r = checkPublishGuard({ aiLabel: "human", sources: [] });
    expect(r.allowed).toBe(true);
  });

  it("AI 단독 발행은 HITL 없으면 거부", () => {
    const r = checkPublishGuard({
      aiLabel: "ai_generated",
      sources: [{ title: "출처", url: "https://example.com" }],
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("HITL");
  });

  it("출처에 URL·발행일·발행자 모두 없으면 거부", () => {
    const r = checkPublishGuard({
      aiLabel: "ai_assisted",
      sources: [{ title: "출처만" }],
    });
    expect(r.allowed).toBe(false);
  });

  it("정상 케이스 통과", () => {
    const r = checkPublishGuard({
      aiLabel: "ai_assisted",
      sources: [{ title: "태안군청", url: "https://taean.go.kr" }],
    });
    expect(r.allowed).toBe(true);
  });
});

// ---------- 라벨 표기 ----------

describe("AI label badge", () => {
  it("사람 작성", () => {
    expect(formatLabelBadge("human")).toBe("[사람 작성]");
  });

  it("AI 보조 + 검토자", () => {
    expect(formatLabelBadge("ai_assisted", "KH")).toBe("[AI 보조 · 검토 KH]");
  });

  it("AI 생성", () => {
    expect(formatLabelBadge("ai_generated")).toBe("[AI 생성]");
  });
});

// ---------- 통합 미들웨어 ----------

describe("applyGovernance (통합)", () => {
  it("정상 AI 보조 콘텐츠 — 출처·HITL 모두 충족", () => {
    const r = applyGovernance({
      body: "안면도 꽃지 해수욕장의 일몰은 17시경이 절정입니다.",
      aiLabel: "ai_assisted",
      sources: [{ title: "태안군청", url: "https://taean.go.kr" }],
      hitlReviewerId: "user-uuid",
    });
    expect(r.approved).toBe(true);
    expect(r.reasons).toHaveLength(0);
  });

  it("PII 자동 마스킹 + 통과", () => {
    const r = applyGovernance({
      body: "독자 010-1234-5678 께서 문의: 일몰 시간은?",
      aiLabel: "ai_assisted",
      sources: [{ title: "출처", url: "https://example.com" }],
      hitlReviewerId: "u",
    });
    expect(r.approved).toBe(true);
    expect(r.body).toContain("010-****-5678");
    expect(r.reasons.some((s) => s.includes("PII"))).toBe(true);
  });

  it("민감 주제(선거) + HITL 없음 → 거부", () => {
    const r = applyGovernance({
      body: "이번 선거에서 후보 모두가...",
      aiLabel: "ai_generated",
      sources: [{ title: "출처", url: "https://example.com" }],
      // hitlReviewerId 없음
    });
    expect(r.approved).toBe(false);
    expect(r.reasons.some((s) => s.includes("선거") || s.includes("HITL") || s.includes("AI 단독"))).toBe(true);
  });

  it("민감 주제(선거) + HITL 있음 → 통과", () => {
    const r = applyGovernance({
      body: "이번 선거에서 후보 모두가...",
      aiLabel: "ai_assisted",
      sources: [{ title: "출처", url: "https://example.com" }],
      hitlReviewerId: "editor-uuid",
    });
    expect(r.approved).toBe(true);
  });

  it("출처 없는 AI 콘텐츠 → 거부", () => {
    const r = applyGovernance({
      body: "관광 정보",
      aiLabel: "ai_assisted",
      sources: [],
      hitlReviewerId: "u",
    });
    expect(r.approved).toBe(false);
  });
});
