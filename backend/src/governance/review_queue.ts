// HITL 검수 큐 — AI 콘텐츠 중 사람 검수가 필요한 항목을 모아 승인/반려.
// 거버넌스 파이프라인(applyGovernance)이 requiresHitl/blockAiOnly로 표시한 콘텐츠가 여기로 들어온다.
// PoC: 인메모리 store + 실제 governance 함수로 시드. D1/Postgres(ai_content_logs) 연결 시 교체.
// TaskMaster #26 (HITL) / #27 (거버넌스)

import type { AiLabel } from "./ai_label";
import { applyGovernance } from "./middleware";
import type { SensitiveTopic } from "./sensitive_topics";
import type { PiiFinding } from "./pii";

export type ReviewStatus = "pending" | "approved" | "rejected";
export type ResourceType = "report" | "qa" | "article" | "dashboard";

export interface ReviewItem {
  id: string;
  resourceType: ResourceType;
  resourceId: string;
  title: string;
  excerpt: string; // PII 마스킹된 본문 미리보기
  aiLabel: AiLabel;
  sensitiveTopics: SensitiveTopic[];
  piiKinds: PiiFinding["kind"][];
  requiresHitl: boolean;
  blockAiOnly: boolean;
  reasons: string[]; // 거버넌스가 표시한 사유
  status: ReviewStatus;
  queuedAt: string;
  reviewerId?: string;
  reviewedAt?: string;
  decisionReason?: string;
}

export interface ReviewDecision {
  decision: "approved" | "rejected";
  reviewerId: string;
  reason?: string;
}

export interface ReviewStats {
  pending: number;
  approved: number;
  rejected: number;
}

// ── 저장소 (PoC: 인메모리) ─────────────────────────────────
export class InMemoryReviewQueue {
  private items = new Map<string, ReviewItem>();

  seed(items: ReviewItem[]): void {
    for (const it of items) this.items.set(it.id, it);
  }

  add(item: ReviewItem): ReviewItem {
    this.items.set(item.id, item);
    return item;
  }

  list(status?: ReviewStatus): ReviewItem[] {
    const all = [...this.items.values()].sort((a, b) => b.queuedAt.localeCompare(a.queuedAt));
    return status ? all.filter((i) => i.status === status) : all;
  }

  get(id: string): ReviewItem | undefined {
    return this.items.get(id);
  }

  decide(id: string, decision: ReviewDecision, now: string): ReviewItem | undefined {
    const it = this.items.get(id);
    if (!it) return undefined;
    it.status = decision.decision;
    it.reviewerId = decision.reviewerId;
    it.reviewedAt = now;
    it.decisionReason = decision.reason;
    return it;
  }

  stats(): ReviewStats {
    const s: ReviewStats = { pending: 0, approved: 0, rejected: 0 };
    for (const it of this.items.values()) s[it.status] += 1;
    return s;
  }
}

export class ReviewQueueService {
  constructor(private repo: InMemoryReviewQueue) {}

  list(status?: ReviewStatus): ReviewItem[] {
    return this.repo.list(status);
  }

  get(id: string): ReviewItem | undefined {
    return this.repo.get(id);
  }

  decide(id: string, decision: ReviewDecision): ReviewItem | undefined {
    return this.repo.decide(id, decision, new Date().toISOString());
  }

  stats(): ReviewStats {
    return this.repo.stats();
  }

  // 시민 코파일럿 제출 → 검수 큐 등록
  enqueue(item: ReviewItem): ReviewItem {
    return this.repo.add(item);
  }
}

// ── 시드: 실제 거버넌스 파이프라인으로 큐 항목 생성 ──────────
interface SeedSpec {
  id: string;
  resourceType: ResourceType;
  resourceId: string;
  title: string;
  body: string;
  aiLabel: AiLabel;
  hasSource: boolean;
  queuedAt: string;
  // 이미 처리된 항목 시드용
  status?: ReviewStatus;
  reviewerId?: string;
  reviewedAt?: string;
  decisionReason?: string;
}

const SEED_SPECS: SeedSpec[] = [
  {
    id: "rev-001",
    resourceType: "qa",
    resourceId: "qa-7781",
    title: "안면도 6·1 지방선거 후보 공약 비교 질의",
    body: "이번 선거에서 안면읍 군의원 후보들의 관광 공약을 비교하면, A후보는 갯벌 생태관광 확대를 공천 공약으로...",
    aiLabel: "ai_generated",
    hasSource: true,
    queuedAt: "2026-06-06T01:10:00Z",
  },
  {
    id: "rev-002",
    resourceType: "article",
    resourceId: "art-3320",
    title: "근흥면 펜션 화재 피해자 인터뷰 초안",
    body: "지난 주말 근흥면에서 발생한 화재로 피해를 입은 김민수(010-1234-5678)씨는 피해자 지원을 요청했다. 검찰은...",
    aiLabel: "ai_assisted",
    hasSource: true,
    queuedAt: "2026-06-06T00:40:00Z",
  },
  {
    id: "rev-003",
    resourceType: "report",
    resourceId: "rep-week-23",
    title: "태안읍 토지 시세 주간 리포트 — 투자 자문 섹션",
    body: "태안읍 일대 토지는 단기 매매를 통한 시세 차익을 노린 갭투자 수요가 늘고 있어, 투자 시 유의가 필요하다.",
    aiLabel: "ai_generated",
    hasSource: false,
    queuedAt: "2026-06-05T23:05:00Z",
  },
  {
    id: "rev-004",
    resourceType: "report",
    resourceId: "rep-week-22",
    title: "꽃지 해수욕장 주말 방문 예측 요약",
    body: "이번 주말 꽃지 해수욕장 방문객은 기상 호조로 전주 대비 증가할 전망이다.",
    aiLabel: "ai_assisted",
    hasSource: true,
    queuedAt: "2026-06-05T09:00:00Z",
    status: "approved",
    reviewerId: "editor-1",
    reviewedAt: "2026-06-05T10:12:00Z",
    decisionReason: "출처 확인 완료, 민감 이슈 없음",
  },
];

export function buildSeedItems(): ReviewItem[] {
  return SEED_SPECS.map((s) => {
    const gov = applyGovernance({
      body: s.body,
      aiLabel: s.aiLabel,
      sources: s.hasSource ? [{ title: "태안신문 취재", publisher: "태안신문" }] : [],
    });
    return {
      id: s.id,
      resourceType: s.resourceType,
      resourceId: s.resourceId,
      title: s.title,
      excerpt: gov.body, // PII 마스킹된 본문
      aiLabel: gov.forcedAiLabel,
      sensitiveTopics: gov.sensitive.topics.map((t) => t.topic),
      piiKinds: gov.pii.findings.map((f) => f.kind),
      requiresHitl: gov.sensitive.requiresHitl,
      blockAiOnly: gov.sensitive.blockAiOnly,
      reasons: gov.reasons,
      status: s.status ?? "pending",
      queuedAt: s.queuedAt,
      reviewerId: s.reviewerId,
      reviewedAt: s.reviewedAt,
      decisionReason: s.decisionReason,
    };
  });
}

// ── 공유 싱글턴 — review_router(검수)와 copilot(제출)이 같은 큐를 본다 ──
// (SEED_SPECS·buildSeedItems 정의 이후에 위치해야 초기화 순서 안전)
let seq = 0;
export function nextReviewId(): string {
  seq += 1;
  return `sub-${Date.now()}-${seq}`;
}
export const reviewStore = new InMemoryReviewQueue();
reviewStore.seed(buildSeedItems());
export const reviewService = new ReviewQueueService(reviewStore);
