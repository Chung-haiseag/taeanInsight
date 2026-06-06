// 시민기자 운영 — 기자 목록·교육 진도·월간 정산.
// PoC: 인메모리 store + 시드(운영 화면 예시 데이터). DB(migration 002) 연결 시 교체.
// ⚠️ 실제 모집은 2026년 7월 중순 예정 — 아래 데이터는 운영 UI 검증용 예시.
// TaskMaster #28(LMS) / #29(정산 대시보드) / #43(모집)

export type SettlementStatus = "pending" | "processing" | "paid" | "failed";

export interface ReporterSummary {
  userId: string;
  name: string;
  cohort: string;
  eupMyeon: string; // 읍·면 코드
  active: boolean;
  onboardingCompleted: boolean;
  publishedCount: number;
  trainingCompleted: number; // 0~6 (총 6회 교육)
  settlement?: {
    month: string; // YYYY-MM
    articleCount: number;
    baseFeeKrw: number;
    bonusKrw: number;
    totalKrw: number;
    status: SettlementStatus;
  };
}

export interface CitizenSummary {
  totalReporters: number;
  active: number;
  publishedTotal: number;
  settlementMonth: string;
  settlementTotalKrw: number;
  pendingSettlements: number;
}

const TRAINING_MODULES = 6;
const CURRENT_MONTH = "2026-06";

export class InMemoryCitizenStore {
  private reporters = new Map<string, ReporterSummary>();

  seed(items: ReporterSummary[]): void {
    for (const r of items) this.reporters.set(r.userId, r);
  }

  list(): ReporterSummary[] {
    return [...this.reporters.values()].sort((a, b) => b.publishedCount - a.publishedCount);
  }

  get(userId: string): ReporterSummary | undefined {
    return this.reporters.get(userId);
  }

  markSettlementPaid(userId: string): ReporterSummary | undefined {
    const r = this.reporters.get(userId);
    if (!r?.settlement) return undefined;
    r.settlement.status = "paid";
    return r;
  }
}

export class CitizenService {
  constructor(private store: InMemoryCitizenStore) {}

  reporters(): ReporterSummary[] {
    return this.store.list();
  }

  summary(): CitizenSummary {
    const all = this.store.list();
    const settlementTotal = all.reduce((sum, r) => sum + (r.settlement?.totalKrw ?? 0), 0);
    const pending = all.filter((r) => r.settlement && r.settlement.status !== "paid").length;
    return {
      totalReporters: all.length,
      active: all.filter((r) => r.active).length,
      publishedTotal: all.reduce((sum, r) => sum + r.publishedCount, 0),
      settlementMonth: CURRENT_MONTH,
      settlementTotalKrw: settlementTotal,
      pendingSettlements: pending,
    };
  }

  paySettlement(userId: string): ReporterSummary | undefined {
    return this.store.markSettlementPaid(userId);
  }
}

// ── 시드 (운영 화면 예시 데이터) ────────────────────────────
function settlement(articleCount: number, bonusKrw: number, status: SettlementStatus) {
  const baseFeeKrw = articleCount * 70_000; // 편당 평균 7만 (5~10만 범위)
  return {
    month: CURRENT_MONTH,
    articleCount,
    baseFeeKrw,
    bonusKrw,
    totalKrw: baseFeeKrw + bonusKrw,
    status,
  };
}

export function buildSeedReporters(): ReporterSummary[] {
  return [
    {
      userId: "cr-01",
      name: "김선주",
      cohort: "2026",
      eupMyeon: "anmyeon",
      active: true,
      onboardingCompleted: true,
      publishedCount: 4,
      trainingCompleted: TRAINING_MODULES,
      settlement: settlement(4, 50_000, "pending"), // 우수 보너스
    },
    {
      userId: "cr-02",
      name: "박도윤",
      cohort: "2026",
      eupMyeon: "taean_eup",
      active: true,
      onboardingCompleted: true,
      publishedCount: 3,
      trainingCompleted: TRAINING_MODULES,
      settlement: settlement(3, 0, "processing"),
    },
    {
      userId: "cr-03",
      name: "이하준",
      cohort: "2026",
      eupMyeon: "sowon",
      active: true,
      onboardingCompleted: true,
      publishedCount: 2,
      trainingCompleted: 5,
      settlement: settlement(2, 0, "pending"),
    },
    {
      userId: "cr-04",
      name: "최서윤",
      cohort: "2026",
      eupMyeon: "geunheung",
      active: true,
      onboardingCompleted: false,
      publishedCount: 1,
      trainingCompleted: 3,
      settlement: settlement(1, 0, "pending"),
    },
    {
      userId: "cr-05",
      name: "정민재",
      cohort: "2026",
      eupMyeon: "wonbuk",
      active: false, // 활동 중단
      onboardingCompleted: true,
      publishedCount: 2,
      trainingCompleted: TRAINING_MODULES,
      settlement: settlement(2, 0, "paid"),
    },
  ];
}
