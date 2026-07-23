// 구조화된 답변 렌더 — parseAnswer로 번호목록을 구조화해 목록으로 보여준다(가독성).

import { parseAnswer } from "@/lib/answer-format";

export function AnswerView({ text }: { text: string }) {
  const blocks = parseAnswer(text);
  if (!blocks.length) {
    return <p className="text-foreground-muted">(빈 응답)</p>;
  }
  return (
    <div className="space-y-3 text-base leading-relaxed text-foreground">
      {blocks.map((b, i) =>
        b.type === "para" ? (
          <p key={i}>{b.text}</p>
        ) : (
          <ol key={i} className="space-y-2">
            {b.items.map((it, j) => (
              <li key={j} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/12 text-xs font-bold text-accent tabular-nums">
                  {j + 1}
                </span>
                <span className="min-w-0">
                  {it.label && <span className="font-semibold text-brand">{it.label}</span>}
                  {it.label ? " — " : ""}
                  {it.body}
                </span>
              </li>
            ))}
          </ol>
        ),
      )}
    </div>
  );
}
