"use client";

// 기사 듣기가 멈췄다는 것을 **관리자 화면 맨 위에서** 알린다.
//
//   2026-11-09: 낭독 생성기가 열흘을 죽어 있었다. 서버 크론은 매일 `⚠ 기사 듣기 죽음` 을
//   정확히 찍고 있었다 — 감지기는 멀쩡했다. 그런데 그 경고가 Worker 로그에만 남아
//   아무에게도 닿지 않았다. Web Push 도 붙였지만(backend/src/audio/alert.ts) 지금은
//   관리자 구독이 0명이라 당장 닿는 길은 이 띠뿐이다.
//
//   ⚠ 탭(건강 탭) 안에 넣지 않는다. 그 탭을 열어 보는 사람만 보게 되면 지금과 똑같아진다.
//     /admin 을 열면 무엇을 하러 왔든 눈에 들어와야 한다.
//   ⚠ 멀쩡할 때는 아무것도 그리지 않는다. 늘 떠 있는 초록 띠는 사흘이면 안 보이게 된다
//     (2026-11-06 '멤버십 상시 하이라이트' 와 같은 이유로 지웠던 그 함정이다).

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://taean-insight-api.chs9182.workers.dev";

interface AudioStatus {
  health?: { ok?: boolean | null; missing?: number; oldestMissingDays?: number | null; checked?: number; checkedAt?: string; ageHours?: number } | null;
  brief?: { date?: string; has?: boolean; ok?: boolean } | null;
  news?: { deadKeys?: number[]; keyCount?: number } | null;
}

/** 'n일 전' 꼴. 모르면 빈 문자열(지어내지 않는다). */
function ago(hours?: number): string {
  if (typeof hours !== "number" || !Number.isFinite(hours)) return "";
  if (hours < 1) return "방금";
  if (hours < 24) return `${Math.round(hours)}시간 전`;
  return `${Math.round(hours / 24)}일 전`;
}

export function AudioHealthBanner() {
  const [s, setS] = useState<AudioStatus | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/api/audio/status`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setS(j); })
      .catch(() => { /* 못 받으면 띠를 그리지 않는다 — 모름을 고장으로 읽지 않는다 */ });
    return () => { alive = false; };
  }, []);

  if (!s) return null;
  const lines: string[] = [];

  if (s.health?.ok === false) {
    const n = s.health.missing ?? 0;
    const d = s.health.oldestMissingDays;
    lines.push(`기사 듣기 — 최근 기사 ${n}건에 음성이 없습니다${typeof d === "number" ? `, 가장 오래된 것은 ${d}일째입니다` : ""}.`);
  }
  // 오늘의 브리핑은 1면에서 독자가 바로 보는 것이라 빠지면 더 눈에 띈다.
  if (s.brief && s.brief.ok === false) lines.push(`오늘의 브리핑 낭독(${s.brief.date})이 아직 없습니다.`);
  // 죽은 열쇠는 사람이 갈기 전엔 영영 안 된다 — 숫자로 적어 둔다.
  const dead = s.news?.deadKeys ?? [];
  if (dead.length) lines.push(`낭독 열쇠 ${dead.map((n) => `#${n}`).join("·")}이(가) 막혔습니다${s.news?.keyCount ? ` (전체 ${s.news.keyCount}개 중)` : ""} — 새 열쇠로 갈아야 합니다.`);

  if (!lines.length) return null;

  return (
    <div role="alert" className="rounded-lg border-2 border-[#B3261E] bg-[#FDECEA] p-4 text-[#5F1512]">
      <p className="font-bold">🔇 소리가 멈췄습니다</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {lines.map((t) => <li key={t}>{t}</li>)}
      </ul>
      <p className="mt-2 text-xs">
        맥에서 낭독 생성기가 도는지 봐 주세요 — <code className="rounded bg-white/60 px-1">tools/news-audio/news-audio.log</code>
        {s.health?.ageHours != null && <span className="ml-1">(마지막 점검 {ago(s.health.ageHours)})</span>}
      </p>
    </div>
  );
}
