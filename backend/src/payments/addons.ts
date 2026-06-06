// 부가상품(add-on) — 기존 구독과 독립적으로 별도 과금되는 기능 단위.
// 1호 add-on: 초개인화 홈(hyper_personalization).
// 결제는 Toss 빌링(payments/toss.ts)을 재사용하되, 본 PoC는 인메모리 entitlement만 관리.
// D1/Postgres 연결 시 InMemoryAddonStore → DB 리포지토리로 교체.

export type AddonKey = "owner_pro";

export interface AddonProduct {
  key: AddonKey;
  name: string;
  description: string;
  priceKrw: number; // 월 구독료 (별도 과금)
  benefits: string[];
}

// 부가상품 카탈로그 — 소상공인(펜션·식당·카페) 단일 페르소나 MVP.
// "화면 재배열"이 아니라 매출 결정(가격·재고·인력)에 직결되는 예측·실행 제안을 판다.
// 가격은 협의/실험으로 조정 가능.
export const ADDON_CATALOG: Record<AddonKey, AddonProduct> = {
  owner_pro: {
    key: "owner_pro",
    name: "사장님 Pro",
    description: "내 가게·내 지역 기준 주말 수요 예측과 가격·재고 실행 제안을 매일 받습니다.",
    priceKrw: 9_900,
    benefits: [
      "이번 주말 방문 수요 예측 (요일별 수치 + 근거)",
      "가격·재고·인력 실행 제안 (예: 토요일 1박 +5천원)",
      "적조·기상·행사 우선 알림 (영업 영향까지)",
      "주변 상권 평균가·점유율 비교",
    ],
  },
};

export function listAddons(): AddonProduct[] {
  return Object.values(ADDON_CATALOG);
}

export function getAddon(key: string): AddonProduct | undefined {
  return ADDON_CATALOG[key as AddonKey];
}

// ── Entitlement 저장소 (PoC: 인메모리) ──────────────────────
export interface AddonEntitlement {
  userId: string;
  key: AddonKey;
  status: "active" | "cancelled";
  subscribedAt: string;
  cancelledAt?: string;
}

export class InMemoryAddonStore {
  // userId → (key → entitlement)
  private byUser = new Map<string, Map<AddonKey, AddonEntitlement>>();

  has(userId: string, key: AddonKey): boolean {
    return this.byUser.get(userId)?.get(key)?.status === "active";
  }

  listForUser(userId: string): AddonEntitlement[] {
    return [...(this.byUser.get(userId)?.values() ?? [])];
  }

  activate(userId: string, key: AddonKey, now: string): AddonEntitlement {
    const ent: AddonEntitlement = { userId, key, status: "active", subscribedAt: now };
    const map = this.byUser.get(userId) ?? new Map<AddonKey, AddonEntitlement>();
    map.set(key, ent);
    this.byUser.set(userId, map);
    return ent;
  }

  cancel(userId: string, key: AddonKey, now: string): AddonEntitlement | undefined {
    const ent = this.byUser.get(userId)?.get(key);
    if (!ent) return undefined;
    ent.status = "cancelled";
    ent.cancelledAt = now;
    return ent;
  }
}

export class AddonService {
  constructor(private store: InMemoryAddonStore) {}

  catalog(): AddonProduct[] {
    return listAddons();
  }

  entitlements(userId: string): { key: AddonKey; active: boolean }[] {
    const active = new Set(
      this.store.listForUser(userId).filter((e) => e.status === "active").map((e) => e.key),
    );
    return listAddons().map((a) => ({ key: a.key, active: active.has(a.key) }));
  }

  hasAddon(userId: string, key: AddonKey): boolean {
    return this.store.has(userId, key);
  }

  // 결제 성공을 전제로 entitlement 활성화. 실제 Toss 빌링 연동은 router에서 주입.
  subscribe(userId: string, key: AddonKey): AddonEntitlement {
    return this.store.activate(userId, key, new Date().toISOString());
  }

  cancel(userId: string, key: AddonKey): AddonEntitlement | undefined {
    return this.store.cancel(userId, key, new Date().toISOString());
  }
}
