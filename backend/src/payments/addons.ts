// 부가상품(add-on) — 기존 구독과 독립적으로 별도 과금되는 기능 단위.
// 1호 add-on: 초개인화 홈(hyper_personalization).
// 결제는 Toss 빌링(payments/toss.ts)을 재사용하되, 본 PoC는 인메모리 entitlement만 관리.
// D1/Postgres 연결 시 InMemoryAddonStore → DB 리포지토리로 교체.

export type AddonKey = "hyper_personalization";

export interface AddonProduct {
  key: AddonKey;
  name: string;
  description: string;
  priceKrw: number; // 월 구독료 (별도 과금)
  benefits: string[];
}

// 부가상품 카탈로그 — 가격은 협의/실험으로 조정 가능
export const ADDON_CATALOG: Record<AddonKey, AddonProduct> = {
  hyper_personalization: {
    key: "hyper_personalization",
    name: "초개인화 홈",
    description: "로그인하면 첫 화면이 내 관심 지역·관심사 기반으로 재구성됩니다.",
    priceKrw: 4_900,
    benefits: [
      "관심 지역의 오늘·이번 주 예측을 홈 최상단에",
      "관심사 기반 맞춤 리포트 요약 자동 배치",
      "즐겨찾기·알림 바로가기 위젯",
      "초개인화 우선순위 정렬(critical/community/personal)",
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
