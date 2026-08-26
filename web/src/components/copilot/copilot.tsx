"use client";

// AI 코파일럿 — 어느 화면에서든 옆에 열리는 대화창.
//
//   왜 만들었나: 질의응답(/query)이 죽어 있었다 — 2026-08-03 이후 물어본 사람이 0명.
//     답의 품질 문제가 아니었다(RAG·근거 표기는 잘 돈다). **형태**가 문제였다 —
//       ① 로그인해야 메뉴가 보여서 대부분의 방문자는 있는 줄도 몰랐다
//       ② 빈 칸 앞에서 질문을 지어내야 했다
//       ③ 읽던 것을 두고 다른 화면으로 떠나야 했다
//     화면 옆에 붙어 있고 '지금 보는 것'을 아는 창이면 셋 다 사라진다.
//
//   ⚠ 로그인을 요구하지 않는다. 발견을 막는 것이 가장 큰 손실이었고,
//     답변은 Workers AI(무료)라 열어도 비용이 늘지 않는다.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { askQuery, type QuerySource } from "@/lib/api/query";
import { trackEvent } from "@/lib/api/reading";
import { getCopilotScreen } from "@/lib/copilot-screen";

interface Msg {
  role: "user" | "assistant";
  text: string;
  sources?: QuerySource[];
  /** 이어지는 질문을 서버가 이렇게 이해했다. */
  rewritten?: string;
  failed?: boolean;
}

/** 화면마다 다른 첫 제안 — 빈 칸 앞에서 막히지 않게 '지금 여기서 물을 만한 것'을 준다. */
function suggestionsFor(path: string): string[] {
  if (path.startsWith("/paper/prices")) return ["1997년 전세는 얼마였어?", "IMF 전후로 집값이 어떻게 변했어?"];
  if (path.startsWith("/paper/ads")) return ["그 시절 구인 광고 임금은 얼마였어?", "가장 오래 실린 광고는?"];
  if (path.startsWith("/people")) return ["태안군수를 지낸 사람들 알려줘", "김영인 의장은 어떤 활동을 했어?"];
  if (path.startsWith("/news/")) return ["이 기사 내용을 요약해줘", "관련된 지난 기사가 있어?"];
  if (path.startsWith("/news")) return ["최근 태안 해상풍력 소식 정리해줘", "안면도 관광 관련 기사 찾아줘"];
  if (path.startsWith("/live") || path.startsWith("/beaches")) return ["오늘 태안 날씨 어때?", "이번 주말 꽃지 일몰 시간은?"];
  if (path.startsWith("/reports")) return ["이번 주 리포트 핵심만 알려줘", "지난주와 달라진 게 뭐야?"];
  return ["태안 미세먼지 농도 추세는?", "1990년부터 태안에 무슨 일이 있었어?"];
}

export function Copilot() {
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 관리자 화면에서는 띄우지 않는다 — 검수 작업 중 가릴 일이 없다.
  const hidden = pathname.startsWith("/admin");

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  const send = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    // 이력은 **보내기 전 상태**로 만든다 — 방금 질문이 이력에 섞이면 서버가 자기 말을 되씹는다.
    const history = msgs.slice(-6).map((m) => ({ role: m.role, text: m.text }));
    setMsgs((prev) => [...prev, { role: "user", text: q }]);
    trackEvent("ai_query", "copilot");
    try {
      // 화면이 자기 값을 등록해 뒀으면 함께 보낸다 — 표·목록은 기사 색인에 없어서
      //   이게 없으면 "옆에 답이 있는데 모르겠다"가 된다.
      const r = await askQuery({ query: q, path: pathname, history, screen: getCopilotScreen() ?? undefined });
      setMsgs((prev) => [...prev, {
        role: "assistant",
        text: r.answer || "답을 찾지 못했습니다.",
        sources: r.sources,
        rewritten: r.rewritten,
      }]);
    } catch {
      setMsgs((prev) => [...prev, {
        role: "assistant",
        text: "지금은 답하기 어렵습니다. 잠시 후 다시 물어봐 주세요.",
        failed: true,
      }]);
    } finally {
      setBusy(false);
    }
  }, [busy, msgs, pathname]);

  if (hidden) return null;

  return (
    <>
      {!open && (
        <button type="button" onClick={() => { setOpen(true); trackEvent("copilot_open", pathname.slice(0, 40)); }}
          className="no-print fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-brand px-5 py-3.5 text-background shadow-lg hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label="AI 코파일럿 열기">
          <span aria-hidden className="text-lg">💬</span>
          <span className="text-sm font-bold">AI에게 묻기</span>
        </button>
      )}

      {open && (
        <div className="no-print fixed inset-0 z-50 flex justify-end sm:inset-y-0 sm:left-auto" role="dialog" aria-modal="false" aria-label="AI 코파일럿">
          {/* 작은 화면에서는 전체를 덮는다 — 좁은 폭에 밀어 넣으면 글이 읽히지 않는다. */}
          <div className="flex h-full w-full flex-col border-l border-brand/15 bg-background shadow-2xl sm:w-[24rem]">
            <header className="flex items-start justify-between gap-3 border-b border-brand/15 px-4 py-3">
              <div>
                <p className="font-bold text-brand">💬 AI 코파일럿</p>
                <p className="text-xs text-foreground-muted">아카이브 근거 · 대화 이어짐</p>
              </div>
              <button type="button" onClick={() => setOpen(false)}
                className="rounded px-2 py-1 text-lg leading-none text-foreground-muted hover:bg-brand/5 hover:text-brand"
                aria-label="닫기">✕</button>
            </header>

            <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {msgs.length === 0 && (
                <div className="space-y-3">
                  <div className="rounded-xl bg-brand/[0.04] p-3 text-sm leading-relaxed text-foreground">
                    태안신문 37년 아카이브를 근거로 답합니다.
                    <strong className="text-brand"> 지금 보는 화면에 대해 물어도 됩니다.</strong>
                  </div>
                  <div className="flex flex-col gap-2">
                    {suggestionsFor(pathname).map((s) => (
                      <button key={s} type="button" onClick={() => void send(s)}
                        className="rounded-xl border border-brand/20 px-3 py-2 text-left text-sm text-brand hover:bg-brand/5">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {msgs.map((m, i) => (
                <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                  <div className={m.role === "user"
                    ? "max-w-[85%] rounded-2xl bg-brand px-3.5 py-2 text-sm text-background"
                    : `max-w-full rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${m.failed ? "bg-red-50 text-red-800" : "bg-brand/[0.04] text-foreground"}`}>
                    {m.rewritten && (
                      <p className="mb-1.5 text-xs text-foreground-muted">
                        이렇게 이해했어요: <span className="text-brand">{m.rewritten}</span>
                      </p>
                    )}
                    <p className="whitespace-pre-wrap">{m.text}</p>
                    {!!m.sources?.length && (
                      <ul className="mt-2 space-y-1 border-t border-brand/10 pt-2">
                        {m.sources.slice(0, 4).map((s, j) => (
                          <li key={j} className="text-xs text-foreground-muted">
                            {s.url
                              ? <a href={s.url} className="text-accent underline" target="_blank" rel="noopener noreferrer">{s.title}</a>
                              : s.title}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}

              {busy && <p className="text-sm text-foreground-muted">아카이브를 찾아보는 중…</p>}
            </div>

            <form onSubmit={(e) => { e.preventDefault(); void send(input); }}
              className="border-t border-brand/15 px-3 py-3">
              <div className="flex gap-2">
                <textarea ref={inputRef} value={input} rows={1}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
                  placeholder="무엇이든 물어보세요"
                  aria-label="질문"
                  className="max-h-28 min-h-[2.75rem] w-full resize-y rounded-xl border border-brand/25 px-3 py-2.5 text-sm focus:border-accent focus:outline-none" />
                <button type="submit" disabled={busy || !input.trim()}
                  className="shrink-0 self-end rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-background disabled:opacity-50">
                  질문
                </button>
              </div>
              <p className="mt-2 text-[0.7rem] leading-relaxed text-foreground-muted">
                ⚠ AI가 만든 답입니다 — 검색된 기사를 근거로 하며, 아카이브 전체를 다 본 것은 아닙니다. 출처 원문 확인을 권합니다.
              </p>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
