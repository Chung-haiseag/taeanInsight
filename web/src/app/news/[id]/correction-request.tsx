"use client";

// 전자북 기사 오탈자 수정 요청 — 회원이 본문에서 틀린 부분을 드래그하면
// 선택 문구가 폼에 자동 입력. 제출하면 관리자 검토 큐(/admin 수정요청 탭)로.

import { useEffect, useState } from "react";

import { submitCorrection } from "@/lib/api/corrections";

export function CorrectionRequest({ idxno }: { idxno: number }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 마지막으로 드래그 선택한 본문 문구를 기억 — 버튼 클릭 시 폼에 자동 입력
  const [lastSelection, setLastSelection] = useState("");
  useEffect(() => {
    const onSelect = () => {
      const t = window.getSelection()?.toString().trim() ?? "";
      if (t.length >= 2 && t.length <= 500) setLastSelection(t);
    };
    document.addEventListener("selectionchange", onSelect);
    return () => document.removeEventListener("selectionchange", onSelect);
  }, []);

  const openForm = () => {
    setSelected(lastSelection);
    setSuggestion("");
    setNote("");
    setDone(false);
    setError(null);
    setOpen(true);
  };

  const submit = async () => {
    if (selected.trim().length < 2 || !suggestion.trim()) {
      setError("지목 원문(2자 이상)과 제안 문구를 입력해 주세요");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await submitCorrection({
        idxno,
        selectedText: selected.trim(),
        suggestion: suggestion.trim(),
        note: note.trim() || undefined,
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "제출하지 못했습니다");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="no-print rounded-lg border border-brand/15 bg-brand/[0.03] px-4 py-3 text-sm">
        <span className="text-foreground-muted">
          옛 지면을 자동 인식(OCR)한 본문이라 오탈자가 있을 수 있습니다. 틀린 부분을 드래그한 뒤{" "}
        </span>
        <button
          type="button"
          onClick={openForm}
          className="font-semibold text-accent hover:underline"
        >
          ✏️ 수정 요청
        </button>
        <span className="text-foreground-muted">을 눌러 알려주세요.</span>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="기사 수정 요청">
          <div className="w-full max-w-lg space-y-4 rounded-2xl bg-background p-6 shadow-xl">
            {done ? (
              <>
                <h3 className="text-lg font-bold text-brand">요청이 접수됐습니다</h3>
                <p className="text-sm text-foreground-muted">
                  관리자가 원본 지면과 대조해 확인 후 반영합니다. 처리 결과는 <strong>내 페이지 → 내 수정 요청</strong>에서 볼 수 있어요.
                </p>
                <div className="flex justify-end">
                  <button type="button" onClick={() => setOpen(false)} className="btn-accent">닫기</button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-bold text-brand">✏️ 기사 수정 요청</h3>
                <label className="block space-y-1 text-sm">
                  <span className="font-semibold text-brand">틀린 부분 (본문에서 드래그하면 자동 입력)</span>
                  <textarea
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                    rows={2}
                    maxLength={500}
                    className="w-full rounded-lg border border-brand/20 bg-background p-2.5 text-sm"
                    placeholder="예: 이중밭 대책은"
                  />
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="font-semibold text-brand">이렇게 고쳐주세요</span>
                  <textarea
                    value={suggestion}
                    onChange={(e) => setSuggestion(e.target.value)}
                    rows={2}
                    maxLength={500}
                    className="w-full rounded-lg border border-brand/20 bg-background p-2.5 text-sm"
                    placeholder="예: 이상반 대책은"
                  />
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="font-semibold text-brand">사유 (선택)</span>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={300}
                    className="w-full rounded-lg border border-brand/20 bg-background p-2.5 text-sm"
                    placeholder="원본 지면 2단 3행 참고 등"
                  />
                </label>
                {error && <p className="text-sm text-red-600">⚠️ {error}</p>}
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setOpen(false)} className="btn-ghost" disabled={busy}>취소</button>
                  <button type="button" onClick={submit} className="btn-accent" disabled={busy}>
                    {busy ? "제출 중…" : "요청 제출"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
