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
import { isMockMode } from "@/lib/mock/me";

const ALL_CATEGORIES: InterestCategory[] = [
  "tourism", "environment", "realestate", "policy", "industry", "culture",
];

const ALL_CHANNELS: Array<{ value: NotificationChannel; label: string; hint: string }> = [
  { value: "email", label: "이메일", hint: "주간 리포트·정기 안내" },
  { value: "webpush", label: "웹 푸시", hint: "사이트 닫아도 OK, 적조·기상 특보" },
  { value: "kakao", label: "카카오 알림톡", hint: "긴급 안전 알림 전용" },
];

const SEGMENT_OPTIONS: UserSegment[] = ["b2c_basic", "b2c_premium", "b2b_basic", "b2b_premium", "b2g"];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [segment, setSegment] = useState<UserSegment>("b2c_basic");
  const [regions, setRegions] = useState<string[]>([]);
  const [categories, setCategories] = useState<InterestCategory[]>([]);
  const [channels, setChannels] = useState<NotificationChannel[]>(["email"]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const limits = SEGMENT_LIMITS[segment];

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
      if (!isMockMode()) {
        await submitOnboarding({ segment, regions, categories, notificationChannels: channels });
      }
      router.push("/me");
    } catch (e) {
      setError(e instanceof Error ? e.message : "온보딩 저장에 실패했습니다");
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">
      <header className="space-y-2">
        <p className="text-xs text-foreground-muted">시작하기 · {step + 1}/4</p>
        <h1 className="text-3xl font-bold text-brand">내 관심사 설정</h1>
        <p className="text-foreground-muted">
          몇 가지만 알려주시면, 매주 받는 정보를 내 관심사 위주로 재구성해드립니다.
        </p>
      </header>

      <ol aria-label="진행 단계" className="flex gap-2">
        {[0, 1, 2, 3].map((i) => (
          <li
            key={i}
            className={`flex-1 h-1.5 rounded ${i <= step ? "bg-accent" : "bg-brand/10"}`}
            aria-current={i === step ? "step" : undefined}
          />
        ))}
      </ol>

      {/* Step 0: 세그먼트 */}
      {step === 0 && (
        <section aria-labelledby="step0" className="space-y-3">
          <h2 id="step0" className="text-xl font-semibold text-brand">
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
        </section>
      )}

      {/* Step 1: 지역 */}
      {step === 1 && (
        <section aria-labelledby="step1" className="space-y-3">
          <h2 id="step1" className="text-xl font-semibold text-brand">
            관심 있는 읍·면을 선택해주세요 (최대 {limits.maxRegions}개)
          </h2>
          <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
            {REGION_OPTIONS.map((r) => (
              <button
                key={r.code}
                type="button"
                onClick={() => toggle(r.code, regions, setRegions, limits.maxRegions)}
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
          <p className="text-xs text-foreground-muted">
            선택: {regions.length} / {limits.maxRegions}
          </p>
        </section>
      )}

      {/* Step 2: 분야 */}
      {step === 2 && (
        <section aria-labelledby="step2" className="space-y-3">
          <h2 id="step2" className="text-xl font-semibold text-brand">
            관심 분야 (최대 {limits.maxCategories}개)
          </h2>
          <div className="grid gap-2 grid-cols-2 md:grid-cols-3">
            {ALL_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => toggle(c, categories, setCategories, limits.maxCategories)}
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
          <p className="text-xs text-foreground-muted">
            선택: {categories.length} / {limits.maxCategories}
          </p>
        </section>
      )}

      {/* Step 3: 알림 채널 */}
      {step === 3 && (
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
        {step < 3 ? (
          <button
            type="button"
            onClick={() => setStep(step + 1)}
            disabled={(step === 1 && regions.length === 0) || (step === 2 && categories.length === 0)}
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
