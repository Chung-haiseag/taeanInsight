// 부가상품(add-on) API 클라이언트 — backend/src/payments/addons_router.ts 매핑

import { apiFetch } from "./client";
import type { AddonEntitlement, AddonKey, AddonProduct } from "../types";

export async function getAddonCatalog(): Promise<{ addons: AddonProduct[] }> {
  return apiFetch<{ addons: AddonProduct[] }>("/api/addons");
}

export async function getMyEntitlements(): Promise<{ entitlements: AddonEntitlement[] }> {
  return apiFetch<{ entitlements: AddonEntitlement[] }>("/api/addons/me");
}

export async function subscribeAddon(key: AddonKey): Promise<{ ok: boolean; charged: number }> {
  return apiFetch(`/api/addons/${key}/subscribe`, { method: "POST" });
}

export async function cancelAddon(key: AddonKey): Promise<{ ok: boolean }> {
  return apiFetch(`/api/addons/${key}/cancel`, { method: "POST" });
}
