"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  CATEGORY_LABELS,
  REGION_OPTIONS,
  SEGMENT_LIMITS,
  type InterestCategory,
  type NotificationChannel,
  type UserSegment,
} from "@/lib/types";
import { submitOnboarding } from "@/lib/api/me";
import { INDUSTRY_OPTIONS, type ShopIndustry } from "@/lib/api/owner";

const ALL_CATEGORIES: InterestCategory[] = [
  "tourism", "environment", "realestate", "policy", "industry", "culture",
];

const ALL_CHANNELS: Array<{ value: NotificationChannel; label: string; hint: string }> = [
  { value: "email", label: "이메일", hint: "주간 리포트·정기 안내" },
  { value: "webpush", label: "웹 푸시", hint: "사이트 닫아도 OK, 적조·기상 특보" },
  { value: "kakao", label: "카카오 알림톡", hint: "긴급 안전 알림 전용" },
];

const SEGMENT_OPTIONS: UserSegment[] = ["b2c_basic", "b2c_premium", "b2b_basic", "b2b_premium", "b2g"];

// 관심사를 세그먼트보다 먼저 받으므로, 선택 단계에선 전 세그먼트 중 최대치까지 허용.
// 세그먼트 확정 후 한도를 초과하면 경고하고 제출 시 한도까지 정리(조용한 손실 금지).
const REGION_CAP = Math.max(...SEGMENT_OPTIONS.map((s) => SEGMENT_LIMITS[s].maxRegions));
const CATEGORY_CAP = Math.max(...SEGMENT_OPTIONS.map((s) => SEGMENT_LIMITS[s].maxCategories));

type StepKey = "region" | "category" | "segment" | "shop" | "channel";
const STEP_LABEL: Record<StepKey, string> = {
  region: "관심 지역", category: "관심 분야", segment: "사용 유형", shop: "가게 정보", channel: "알림 방법",
};

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [shopRooms, setShopRooms] = useState("");
  const [shopWkPrice, setShopWkPrice] = useState("");
  const [regions, setRegions] = useState<string[]>([]);
  const [categories, setCategories] = useState<InterestCategory[]>([]);
  const [segment, setSegment] = useState<UserSegment>("b2c_basic");
  const [channels, setChannels] = useState<NotificationChannel[]>(["email"]);
  const [industry, setIndustry] = useState<ShopIndustry | null>(null);
  const [shopName, setShopName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 사장님·기관 유형(비-b2c_basic)일 때만 가게 정보 스텝 노출
  const isOwner = segment !== "b2c_basic";
  const stepKeys: StepKey[] = ["region", "category", "segment", ...(isOwner ? (["shop"] as StepKey[]) : []), "channel"];
  const totalSteps = stepKeys.length;
  const key = stepKeys[Math.min(step, totalSteps - 1)];
  const isLast = step >= totalSteps - 1;

  const limits = SEGMENT_LIMITS[segment];
  // 선택한 유형의 한도를 관심사가 초과하는지(=완료 시 정리될지)
  const trimmedRegions = regions.slice(0, limits.maxRegions);
  const trimmedCategories = categories.slice(0, limits.maxCategories);
  const overRegions = regions.length - trimmedRegions.length;
  const overCategories = categories.length - trimmedCategories.length;

  function toggle<T>(value: T, list: T[], setList: (v: T[]) => void, max?: number) {
    if (list.includes(value)) setList(list.filter((x) => x !== value));
    else {
      if (max && list.length >= max) return;
      setList([...list, value]);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      // 데모(mock)에서도 실제 백엔드(익명 uid)에 저장 → 리포트 개인화 작동.
      // 세그먼트 한도를 넘는 관심사는 한도까지 정리해 제출(백엔드 422 방지, 경고는 이미 노출됨).
      await submitOnboarding({
        segment,
        regions: trimmedRegions,
        categories: trimmedCategories,
        notificationChannels: channels,
        shopProfile: isOwner && industry
          ? {
              industry, eupMyeon: trimmedRegions[0], name: shopName || undefined,
              ...(industry === "lodging"
                ? { capacity: shopRooms ? Number(shopRooms) : undefined, weekendPrice: shopWkPrice ? Number(shopWkPrice) : undefined }
                : industry === "food" || industry === "cafe" || industry === "leisure" || industry === "retail" || industry === "fishing" || industry === "travel" || industry === "golf"
                ? { capacity: shopRooms ? Number(shopRooms) : undefined, basePrice: shopWkPrice ? Number(shopWkPrice) : undefined }
                : {}),
            }
          : undefined,
      });
      router.push("/me");
    } catch (e) {
      setError(e instanceof Error ? e.message : "온보딩 저장에 실패했습니다");
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">
      <header className="space-y-2">
        <p className="text-xs text-foreground-muted">
          시작하기 · {step + 1}/{totalSteps} · {STEP_LABEL[key]}
        </p>
        <h1 className="text-3xl font-bold text-brand">내 관심사 설정</h1>
        <p className="text-foreground-muted">
          관심사를 먼저 알려주세요. 매주 받는 정보를 그 기준으로 재구성해드립니다. (2~3분)
        </p>
      </header>

      <ol aria-label="진행 단계" className="flex gap-2">
        {stepKeys.map((k, i) => (
          <li
            key={k}
            className={`flex-1 h-1.5 rounded ${i <= step ? "bg-accent" : "bg-brand/10"}`}
            aria-current={i === step ? "step" : undefined}
          />
        ))}
      </ol>

      {/* Step: 지역 */}
      {key === "region" && (
        <section aria-labelledby="step0" className="space-y-3">
          <h2 id="step0" className="text-xl font-semibold text-brand">
            관심 있는 읍·면을 선택해주세요
          </h2>
          <p className="text-sm text-foreground-muted">
            여러 곳을 골라도 됩니다. 나중에 변경 가능합니다.
          </p>
          <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
            {REGION_OPTIONS.map((r) => (
              <button
                key={r.code}
                type="button"
                onClick={() => toggle(r.code, regions, setRegions, REGION_CAP)}
                aria-pressed={regions.includes(r.code)}
                className={`border rounded p-3 text-sm ${
                  regions.includes(r.code)
                    ? "border-accent bg-accent-subtle/30 text-brand font-semibold"
                    : "border-brand/15 text-foreground-muted hover:border-brand/40"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-foreground-muted">선택: {regions.length}곳</p>
        </section>
      )}

      {/* Step: 분야 */}
      {key === "category" && (
        <section aria-labelledby="step1" className="space-y-3">
          <h2 id="step1" className="text-xl font-semibold text-brand">
            관심 분야를 선택해주세요
          </h2>
          <div className="grid gap-2 grid-cols-2 md:grid-cols-3">
            {ALL_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => toggle(c, categories, setCategories, CATEGORY_CAP)}
                aria-pressed={categories.includes(c)}
                className={`border rounded p-3 text-sm ${
                  categories.includes(c)
                    ? "border-accent bg-accent-subtle/30 text-brand font-semibold"
                    : "border-brand/15 text-foreground-muted hover:border-brand/40"
                }`}
              >
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
          <p className="text-xs text-foreground-muted">선택: {categories.length}개</p>
        </section>
      )}

      {/* Step: 세그먼트(유형) */}
      {key === "segment" && (
        <section aria-labelledby="step2" className="space-y-3">
          <h2 id="step2" className="text-xl font-semibold text-brand">
            어떤 유형으로 사용하시나요?
          </h2>
          <p className="text-sm text-foreground-muted">
            정확하지 않아도 됩니다. 나중에 변경 가능합니다.
          </p>
          <div className="grid gap-2">
            {SEGMENT_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSegment(s)}
                aria-pressed={segment === s}
                className={`text-left border rounded p-3 transition-colors ${
                  segment === s ? "border-accent bg-accent-subtle/30" : "border-brand/15 hover:border-brand/40"
                }`}
              >
                <p className="font-semibold text-brand">{SEGMENT_LIMITS[s].label}</p>
                <p className="text-xs text-foreground-muted">
                  관심 지역 {SEGMENT_LIMITS[s].maxRegions}개·분야 {SEGMENT_LIMITS[s].maxCategories}개·즐겨찾기{" "}
                  {SEGMENT_LIMITS[s].maxFavorites}개
                </p>
              </button>
            ))}
          </div>
          {(overRegions > 0 || overCategories > 0) && (
            <p className="text-sm text-amber-700 border border-amber-300 bg-amber-50 rounded p-3">
              ⚠️ 선택한 유형은 관심 {[
                overRegions > 0 ? `지역 ${limits.maxRegions}개` : null,
                overCategories > 0 ? `분야 ${limits.maxCategories}개` : null,
              ]
                .filter(Boolean)
                .join("·")}까지예요. 초과한 항목은 앞에서 고른 순서대로 저장됩니다.
              상위 유형을 고르면 더 많이 담을 수 있어요.
            </p>
          )}
        </section>
      )}

      {/* Step: 가게 정보 (사장님·기관 유형만) */}
      {key === "shop" && (
        <section aria-labelledby="step-shop" className="space-y-3">
          <h2 id="step-shop" className="text-xl font-semibold text-brand">
            가게(사업장) 정보를 알려주세요
          </h2>
          <p className="text-sm text-foreground-muted">
            업종·지역에 맞춘 <strong className="text-brand">실행 제안</strong>(수요·날씨·물때 기반)을 드립니다. 나중에 변경 가능합니다.
          </p>
          <div className="grid gap-2 grid-cols-2 md:grid-cols-3">
            {INDUSTRY_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setIndustry(o.value)}
                aria-pressed={industry === o.value}
                className={`border rounded p-3 text-sm text-left ${
                  industry === o.value
                    ? "border-accent bg-accent-subtle/30 text-brand font-semibold"
                    : "border-brand/15 text-foreground-muted hover:border-brand/40"
                }`}
              >
                <span className="mr-1" aria-hidden>{o.emoji}</span>{o.label}
              </button>
            ))}
          </div>
          <input
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            placeholder="상호(선택)"
            aria-label="상호"
            className="w-full border border-brand/20 rounded px-3 py-2 text-sm"
          />
          {industry && ["lodging", "food", "cafe", "leisure", "retail", "fishing", "travel", "golf"].includes(industry) && (
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={shopRooms}
                onChange={(e) => setShopRooms(e.target.value.replace(/[^0-9]/g, ""))}
                inputMode="numeric"
                placeholder={industry === "lodging" ? "객실 수(예: 20)" : industry === "leisure" ? "일 정원(예: 50)" : industry === "retail" ? "평일 평균 방문객(예: 100)" : industry === "fishing" ? "승선 정원(예: 12)" : industry === "travel" ? "일 투어 정원(예: 40)" : industry === "golf" ? "일 내장 정원(예: 200)" : "좌석 수(예: 40)"}
                aria-label="규모"
                className="w-full border border-brand/20 rounded px-3 py-2 text-sm"
              />
              <input
                value={shopWkPrice}
                onChange={(e) => setShopWkPrice(e.target.value.replace(/[^0-9]/g, ""))}
                inputMode="numeric"
                placeholder={industry === "lodging" ? "주말 기본가(원, 예: 80000)" : industry === "leisure" ? "1인 체험료(원, 예: 30000)" : industry === "fishing" ? "1인 승선료(원, 예: 50000)" : industry === "travel" ? "1인 상품가(원, 예: 45000)" : industry === "golf" ? "1인 그린피(원, 예: 120000)" : "객단가(원, 예: 15000)"}
                aria-label="요금"
                className="w-full border border-brand/20 rounded px-3 py-2 text-sm"
              />
              <p className="sm:col-span-2 text-xs text-accent">→ {industry === "lodging" ? "예상 가동률·권장가·1박 매출" : industry === "leisure" ? "예상 참가자·매출" : industry === "retail" ? "예상 방문·매출" : industry === "fishing" ? "출항 가부·예상 매출" : industry === "travel" ? "예상 예약·매출" : industry === "golf" ? "예상 내장·매출" : "예상 혼잡도·손님·매출"}이 계산됩니다.</p>
            </div>
          )}
          {industry && (industry === "salt" || industry === "farming" || industry === "realtor" || industry === "aqua") && (
            <p className="text-xs text-foreground-muted">{industry === "realtor" ? "실거래 기반 시세 보드가 자동 표시됩니다(별도 입력 불필요)." : "날씨·수온 기반 운영 보드가 자동 표시됩니다(별도 입력 불필요)."}</p>
          )}
          <p className="text-xs text-foreground-muted">
            지역은 첫 번째 관심 읍·면({REGION_OPTIONS.find((r) => r.code === trimmedRegions[0])?.label ?? "미선택"})으로 설정됩니다. 건너뛰어도 됩니다.
          </p>
        </section>
      )}

      {/* Step: 알림 채널 */}
      {key === "channel" && (
        <section aria-labelledby="step3" className="space-y-3">
          <h2 id="step3" className="text-xl font-semibold text-brand">알림 받는 방법</h2>
          <p className="text-sm text-foreground-muted">
            여러 개 선택 가능합니다. 푸시는 다음 화면에서 구독 권한을 별도 요청합니다.
          </p>
          <div className="grid gap-2">
            {ALL_CHANNELS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value, channels, setChannels)}
                aria-pressed={channels.includes(opt.value)}
                className={`text-left border rounded p-3 ${
                  channels.includes(opt.value) ? "border-accent bg-accent-subtle/30" : "border-brand/15 hover:border-brand/40"
                }`}
              >
                <p className="font-semibold text-brand">{opt.label}</p>
                <p className="text-xs text-foreground-muted">{opt.hint}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600 border border-red-200 rounded p-2">
          {error}
        </p>
      )}

      <div className="flex justify-between pt-4">
        <button
          type="button"
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0 || submitting}
          className="text-foreground-muted disabled:opacity-40"
        >
          이전
        </button>
        {!isLast ? (
          <button
            type="button"
            onClick={() => setStep(step + 1)}
            disabled={(key === "region" && regions.length === 0) || (key === "category" && categories.length === 0)}
            className="bg-brand text-background px-5 py-2 rounded font-semibold disabled:opacity-60"
          >
            다음
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-accent text-background px-5 py-2 rounded font-semibold disabled:opacity-60"
          >
            {submitting ? "저장 중..." : "완료하고 시작하기"}
          </button>
        )}
      </div>
    </div>
  );
}
