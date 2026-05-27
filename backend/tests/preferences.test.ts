// #44 초개인화 — 선호·온보딩·콘텐츠 필터·Web Push 단위 테스트

import { describe, expect, it } from "vitest";

import {
  filterForUser,
  decideVisibility,
  sortByRecency,
  type FilterableContent,
} from "../src/preferences/content_filter";
import {
  InMemoryFavoritesRepo,
  InMemoryPreferencesRepo,
} from "../src/preferences/repository";
import { LimitExceededError, PreferencesService } from "../src/preferences/service";
import { SEGMENT_LIMITS, checkLimits, type UserPreferences } from "../src/preferences/types";
import {
  InMemoryWebPushSubscriptionRepo,
  StubWebPushDispatcher,
  broadcast,
} from "../src/notifications/web_push";

const baseUser: UserPreferences = {
  userId: "u1",
  segment: "b2c_premium",
  regions: ["anmyeon", "manripo"],
  categories: ["tourism", "environment"],
  notificationChannels: ["webpush", "email"],
  onboardedAt: "2026-05-27T00:00:00Z",
  updatedAt: "2026-05-27T00:00:00Z",
};

// ---------- Limits ----------

describe("checkLimits", () => {
  it("B2C Basic은 지역 2개 한도", () => {
    const v = checkLimits("b2c_basic", { regions: ["a", "b", "c"] });
    expect(v).toHaveLength(1);
    expect(v[0].field).toBe("regions");
    expect(v[0].limit).toBe(2);
  });

  it("B2C Premium은 5개까지", () => {
    const v = checkLimits("b2c_premium", { regions: ["a", "b", "c", "d", "e"] });
    expect(v).toHaveLength(0);
  });

  it("B2G는 카테고리 6개까지", () => {
    const all = ["tourism", "environment", "realestate", "policy", "industry", "culture"] as const;
    const v = checkLimits("b2g", { categories: [...all] });
    expect(v).toHaveLength(0);
  });

  it("SEGMENT_LIMITS 시드 데이터 정확성 (v1.8)", () => {
    expect(SEGMENT_LIMITS.b2c_basic.maxFavorites).toBe(10);
    expect(SEGMENT_LIMITS.b2c_premium.maxFavorites).toBe(50);
    expect(SEGMENT_LIMITS.b2g.maxTeamMembers).toBe(20);
    expect(SEGMENT_LIMITS.b2b_premium.premiumPdf).toBe(true);
    expect(SEGMENT_LIMITS.b2c_basic.premiumPdf).toBe(false);
  });
});

// ---------- Service: 온보딩 ----------

describe("PreferencesService.onboard", () => {
  function makeSvc() {
    return new PreferencesService(new InMemoryPreferencesRepo(), new InMemoryFavoritesRepo());
  }

  it("정상 온보딩", async () => {
    const svc = makeSvc();
    const prefs = await svc.onboard({
      userId: "u1",
      segment: "b2c_premium",
      regions: ["anmyeon", "manripo"],
      categories: ["tourism", "environment"],
      notificationChannels: ["webpush"],
    });
    expect(prefs.onboardedAt).toBeTruthy();
    expect(prefs.regions).toHaveLength(2);
  });

  it("한도 초과 시 LimitExceededError", async () => {
    const svc = makeSvc();
    await expect(
      svc.onboard({
        userId: "u1",
        segment: "b2c_basic",
        regions: ["a", "b", "c"],     // 한도 2
        categories: ["tourism"],
        notificationChannels: ["email"],
      }),
    ).rejects.toBeInstanceOf(LimitExceededError);
  });

  it("중복 입력은 자동 제거", async () => {
    const svc = makeSvc();
    const prefs = await svc.onboard({
      userId: "u1",
      segment: "b2c_premium",
      regions: ["anmyeon", "anmyeon", "manripo"],
      categories: ["tourism"],
      notificationChannels: ["webpush", "webpush"],
    });
    expect(prefs.regions).toEqual(["anmyeon", "manripo"]);
    expect(prefs.notificationChannels).toEqual(["webpush"]);
  });
});

// ---------- Service: 세그먼트 변경 ----------

describe("PreferencesService.changeSegment", () => {
  it("Premium → Basic 다운그레이드 시 한도 초과분 자동 절단", async () => {
    const prefRepo = new InMemoryPreferencesRepo();
    const svc = new PreferencesService(prefRepo, new InMemoryFavoritesRepo());

    await svc.onboard({
      userId: "u1",
      segment: "b2c_premium",
      regions: ["anmyeon", "manripo", "chunlipo", "sinduri", "geunheung"],
      categories: ["tourism", "environment", "realestate", "policy"],
      notificationChannels: ["email"],
    });

    const after = await svc.changeSegment("u1", "b2c_basic");
    expect(after.regions).toHaveLength(2);                  // basic 한도
    expect(after.categories).toHaveLength(2);
  });
});

// ---------- Service: 즐겨찾기 ----------

describe("PreferencesService favorites", () => {
  function makeWithPrefs() {
    const prefRepo = new InMemoryPreferencesRepo();
    const favRepo = new InMemoryFavoritesRepo();
    const svc = new PreferencesService(prefRepo, favRepo);
    return { svc, favRepo, prefRepo };
  }

  it("즐겨찾기 추가·조회·삭제", async () => {
    const { svc } = makeWithPrefs();
    await svc.onboard({
      userId: "u1", segment: "b2c_premium",
      regions: ["anmyeon"], categories: ["tourism"], notificationChannels: ["webpush"],
    });

    const f = await svc.addFavorite("u1", "place", "kkotji-beach", { label: "꽃지" });
    expect(f.kind).toBe("place");
    expect((await svc.listFavorites("u1"))).toHaveLength(1);

    await svc.removeFavorite("u1", f.id);
    expect((await svc.listFavorites("u1"))).toHaveLength(0);
  });

  it("즐겨찾기 한도 초과 (b2c_basic = 10개)", async () => {
    const { svc } = makeWithPrefs();
    await svc.onboard({
      userId: "u1", segment: "b2c_basic",
      regions: ["anmyeon"], categories: ["tourism"], notificationChannels: ["webpush"],
    });

    for (let i = 0; i < 10; i += 1) {
      await svc.addFavorite("u1", "place", `place-${i}`);
    }
    await expect(svc.addFavorite("u1", "place", "place-11")).rejects.toBeInstanceOf(LimitExceededError);
  });
});

// ---------- Content Filter ----------

describe("Content visibility tier filter", () => {
  it("critical은 무조건 show", () => {
    const c: FilterableContent = { id: "c1", visibilityTier: "critical", category: "policy" };
    expect(decideVisibility(c, baseUser).visibility).toBe("show");
  });

  it("community + 관심 분야 일치 → show", () => {
    const c: FilterableContent = { id: "c1", visibilityTier: "community", category: "tourism" };
    expect(decideVisibility(c, baseUser).visibility).toBe("show");
  });

  it("community + 관심 분야 불일치 → show_small", () => {
    const c: FilterableContent = { id: "c1", visibilityTier: "community", category: "policy" };
    expect(decideVisibility(c, baseUser).visibility).toBe("show_small");
  });

  it("personal + 분야·지역 모두 일치 → show", () => {
    const c: FilterableContent = {
      id: "c1", visibilityTier: "personal", category: "tourism", region: "anmyeon",
    };
    expect(decideVisibility(c, baseUser).visibility).toBe("show");
  });

  it("personal + 일부만 일치 → show_small", () => {
    const c: FilterableContent = {
      id: "c1", visibilityTier: "personal", category: "tourism", region: "geunheung",
    };
    expect(decideVisibility(c, baseUser).visibility).toBe("show_small");
  });

  it("personal + 둘 다 불일치 → hide", () => {
    const c: FilterableContent = {
      id: "c1", visibilityTier: "personal", category: "policy", region: "geunheung",
    };
    expect(decideVisibility(c, baseUser).visibility).toBe("hide");
  });

  it("filterForUser는 3분류로 묶어 반환", () => {
    const items: FilterableContent[] = [
      { id: "1", visibilityTier: "critical", category: "policy" },
      { id: "2", visibilityTier: "community", category: "tourism" },
      { id: "3", visibilityTier: "community", category: "policy" },
      { id: "4", visibilityTier: "personal", category: "tourism", region: "anmyeon" },
      { id: "5", visibilityTier: "personal", category: "policy", region: "geunheung" },
    ];
    const r = filterForUser(items, baseUser);
    expect(r.primary.map((x) => x.id).sort()).toEqual(["1", "2", "4"]);
    expect(r.secondary.map((x) => x.id)).toEqual(["3"]);
    expect(r.hidden.map((x) => x.id)).toEqual(["5"]);
  });

  it("sortByRecency", () => {
    const items: FilterableContent[] = [
      { id: "1", visibilityTier: "personal", publishedAt: "2026-05-01T00:00:00Z" },
      { id: "2", visibilityTier: "personal", publishedAt: "2026-05-20T00:00:00Z" },
      { id: "3", visibilityTier: "personal", publishedAt: "2026-05-10T00:00:00Z" },
    ];
    const sorted = sortByRecency(items);
    expect(sorted.map((x) => x.id)).toEqual(["2", "3", "1"]);
  });
});

// ---------- Web Push ----------

describe("Web Push", () => {
  it("broadcast는 dispatcher.send를 모든 구독에 호출", async () => {
    const repo = new InMemoryWebPushSubscriptionRepo();
    await repo.add({ userId: "u1", endpoint: "e1", p256dhKey: "k1", authKey: "a1", enabled: true, createdAt: "" });
    await repo.add({ userId: "u2", endpoint: "e2", p256dhKey: "k2", authKey: "a2", enabled: true, createdAt: "" });

    const dispatcher = new StubWebPushDispatcher();
    const subs = await repo.listEnabledForUsers(["u1", "u2"]);
    const r = await broadcast(dispatcher, subs, { title: "적조 주의보", body: "안면도" }, repo);

    expect(r.sent).toBe(2);
    expect(r.failed).toBe(0);
    expect(dispatcher.sent).toHaveLength(2);
  });

  it("410 응답 시 구독 자동 비활성화", async () => {
    const repo = new InMemoryWebPushSubscriptionRepo();
    await repo.add({ userId: "u1", endpoint: "e1", p256dhKey: "k1", authKey: "a1", enabled: true, createdAt: "" });
    const dispatcher: import("../src/notifications/web_push").WebPushDispatcher = {
      send: async () => ({ ok: false, status: 410 }),
    };
    const subs = await repo.listEnabledForUsers(["u1"]);
    await broadcast(dispatcher, subs, { title: "x", body: "y" }, repo);
    const enabledAfter = await repo.listEnabledForUser("u1");
    expect(enabledAfter).toHaveLength(0);
  });
});
