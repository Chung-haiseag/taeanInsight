"use client";

// 리포트 음성 읽기 — 브라우저 내장 Web Speech API(SpeechSynthesis). 무료·서버 불필요·한국어.
// 긴 텍스트는 일부 브라우저가 중간에 끊으므로 문장 단위로 쪼개 큐로 재생한다.

import { useEffect, useRef, useState } from "react";

// TTS용 정규화 — 기호를 자연스러운 낭독으로(백엔드 normalizeForTts와 동일 취지)
function normalizeForTts(t: string): string {
  return t
    .replace(/(\d)\s*[~∼〜]\s*(\d)/g, "$1에서 $2")
    .replace(/[·・‧∙•ㆍ]/g, ", ")
    .replace(/[~∼〜]/g, " ")
    .replace(/[（(]/g, ", ").replace(/[）)]/g, ", ")
    .replace(/(\d)\s*%/g, "$1 퍼센트")
    .replace(/㎡/g, "제곱미터").replace(/㎞/g, "킬로미터").replace(/㎏/g, "킬로그램")
    .replace(/,\s*,+/g, ", ").replace(/\s{2,}/g, " ").replace(/\s+([.,!?])/g, "$1").trim();
}

// 텍스트를 ~180자 이하 청크로 분할(문장 경계 우선)
function chunk(text: string): string[] {
  const sentences = normalizeForTts(text).replace(/\s+/g, " ").trim().split(/(?<=[.!?。…\n])\s+/);
  const out: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if ((buf + " " + s).length > 180 && buf) { out.push(buf); buf = s; }
    else buf = buf ? `${buf} ${s}` : s;
  }
  if (buf) out.push(buf);
  return out.filter(Boolean);
}

// 한국어 음성 중 가장 자연스러운 것 선택 — 클라우드/신경망 보이스 우선
function pickKoVoice(): SpeechSynthesisVoice | null {
  const vs = (window.speechSynthesis?.getVoices?.() ?? []).filter((v) => v.lang?.toLowerCase().startsWith("ko"));
  if (!vs.length) return null;
  const score = (v: SpeechSynthesisVoice): number => {
    const n = v.name.toLowerCase();
    let s = 0;
    if (n.includes("google")) s += 6;                                   // Chrome: 가장 자연스러움
    if (/neural|natural|premium|enhanced/.test(n)) s += 5;
    if (n.includes("siri")) s += 4;                                      // Apple Siri 음성
    if (/yuna|유나/.test(n)) s += 3;                                     // macOS 한국어
    if (/sunhi|injoon|heami|선희|인준/.test(n)) s += 3;                  // MS Azure 신경망
    if (!v.localService) s += 2;                                         // 클라우드 음성 가산
    return s;
  };
  return vs.slice().sort((a, b) => score(b) - score(a))[0];
}

export function ReportTTS({ text, label = "음성으로 듣기" }: { text: string; label?: string }) {
  const [speaking, setSpeaking] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      const syn = window.speechSynthesis;
      syn.getVoices(); // 음성 목록 비동기 로드 트리거
      const onVoices = () => syn.getVoices();
      syn.addEventListener?.("voiceschanged", onVoices);
      return () => { syn.removeEventListener?.("voiceschanged", onVoices); syn.cancel(); };
    }
  }, []);

  const stop = () => {
    cancelledRef.current = true;
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  };

  const play = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      alert("이 브라우저는 음성 읽기를 지원하지 않습니다.");
      return;
    }
    if (!text.trim()) return;
    cancelledRef.current = false;
    window.speechSynthesis.cancel(); // 큐 초기화
    const voice = pickKoVoice();
    // 한국어 음성이 없으면 영어 음성으로 한국어를 읽어 발음이 깨짐 → 차단 + 안내
    if (!voice) {
      alert("이 기기/브라우저에 한국어 음성이 없어 음성 읽기를 지원하지 않습니다.\n(크롬 사용 또는 OS에 한국어 음성 추가 시 가능)");
      return;
    }
    const parts = chunk(text);
    setSpeaking(true);
    parts.forEach((part, i) => {
      const u = new SpeechSynthesisUtterance(part);
      u.lang = "ko-KR";
      u.rate = 0.96;   // 약간 느리게 — 또박또박 자연스럽게
      u.pitch = 1.05;  // 살짝 높여 단조로움 완화
      if (voice) u.voice = voice;
      if (i === parts.length - 1) {
        u.onend = () => { if (!cancelledRef.current) setSpeaking(false); };
      }
      u.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(u);
    });
  };

  return (
    <button
      type="button"
      onClick={speaking ? stop : play}
      aria-label={speaking ? "음성 정지" : label}
      className="btn-ghost no-print inline-flex items-center gap-1.5 px-4 py-2 text-xs"
    >
      <span aria-hidden>{speaking ? "⏹" : "🔊"}</span>
      {speaking ? "정지" : label}
    </button>
  );
}
