import { clsx } from "clsx";

type AILabelKind = "human" | "ai_assisted" | "ai_generated";

const LABEL_MAP: Record<AILabelKind, { text: string; description: string }> = {
  human: { text: "사람 작성", description: "사람이 직접 작성한 콘텐츠" },
  ai_assisted: { text: "AI 보조", description: "AI가 사실 확인·요약·다듬기를 보조했으며 편집부가 검토했습니다" },
  ai_generated: { text: "AI 생성", description: "AI가 생성한 후 편집부가 검토·발행한 콘텐츠" },
};

export function AILabelBadge({ kind, className }: { kind: AILabelKind; className?: string }) {
  const { text, description } = LABEL_MAP[kind];
  return (
    <span
      role="img"
      aria-label={description}
      title={description}
      className={clsx(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold",
        kind === "human" && "bg-foreground-muted/10 text-foreground-muted",
        kind === "ai_assisted" && "bg-accent text-background",
        kind === "ai_generated" && "bg-accent-subtle text-brand-dark",
        className,
      )}
    >
      <span aria-hidden="true">●</span>
      {text}
    </span>
  );
}
