"use client";

// 시민 코파일럿 에디터 (MVP)
//  · 작성 중 실시간 거버넌스 점검(PII·민감주제) — 무LLM
//  · AI 라벨 + 출처
//  · 제출 → 거버넌스 적용 → AI 라벨 산정 → HITL 검수 큐
// AI 글쓰기 보조(다듬기·요약·관련기사)는 다음 단계(Workers AI/Claude·아카이브 RAG)

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { createArticle, getMyArticle, submitArticle, updateArticle } from "@/lib/api/citizen-articles";
import { getArchiveArticle, type ArchiveArticle } from "@/lib/api/archive";

import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/icon";
import {
  copilotAssist,
  copilotCheck,
  copilotContextData,
  copilotDraft,
  copilotRelated,
  copilotUploadImage,
  PII_LABELS,
  SENSITIVE_LABELS,
  type AiLabel,
  type AssistMode,
  type CheckResult,
  type ContextBlock,
  type RelatedArticle,
  type SubmitResult,
} from "@/lib/api/copilot";

const DRAFT_KEY = "taean-citizen-draft";
const TITLE_MAX = 100;

export default function CopilotEditorPageWrapper() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-sm text-foreground-muted">에디터를 불러오는 중…</div>}>
      <CopilotEditorPage />
    </Suspense>
  );
}

function CopilotEditorPage() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [aiLabel, setAiLabel] = useState<AiLabel>("human");
  const [source, setSource] = useState("");
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [keywords, setKeywords] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftErr, setDraftErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [articleId, setArticleId] = useState<string | null>(null);
  const [serverSaving, setServerSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loaded = useRef(false);
  const sp = useSearchParams();
  const editId = sp.get("id");
  const fromAlert = sp.get("from") === "alert";

  // 로드: 취재알림 핸드오프(AI 초안) > ?id= 서버 기사 > localStorage 임시저장
  useEffect(() => {
    (async () => {
      // 취재 알림 → AI 기사 초안 핸드오프(sessionStorage)
      if (fromAlert) {
        try {
          const raw = sessionStorage.getItem("reporter-article-draft");
          if (raw) {
            const d = JSON.parse(raw) as { title?: string; body?: string; sources?: { title: string }[] };
            setTitle(d.title ?? ""); setBody(d.body ?? "");
            setAiLabel("ai_assisted");
            setSource(d.sources?.[0]?.title ?? "");
            sessionStorage.removeItem("reporter-article-draft");
            setRestored(true);
          }
        } catch { /* 무시 */ }
        loaded.current = true;
        return;
      }
      if (editId) {
        try {
          const a = await getMyArticle(editId);
          setArticleId(a.id); setTitle(a.title); setBody(a.body); setAiLabel(a.aiLabel);
          setSource(a.sources[0]?.title ?? "");
        } catch { /* 없으면 새 글로 */ }
        loaded.current = true;
        return;
      }
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (raw) {
          const d = JSON.parse(raw) as { title?: string; body?: string; aiLabel?: AiLabel; source?: string; at?: string };
          if (d.title || d.body) {
            setTitle(d.title ?? ""); setBody(d.body ?? "");
            setAiLabel(d.aiLabel ?? "human"); setSource(d.source ?? "");
            setSavedAt(d.at ?? null); setRestored(true);
          }
        }
      } catch { /* 무시 */ }
      loaded.current = true;
    })();
  }, [editId]);

  // 임시저장 자동 저장(디바운스)
  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => {
      try {
        if (title || body) {
          const at = new Date().toISOString();
          localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, body, aiLabel, source, at }));
          setSavedAt(at);
        }
      } catch { /* 무시 */ }
    }, 800);
    return () => clearTimeout(t);
  }, [title, body, aiLabel, source]);

  async function generateDraft() {
    if (!keywords.trim()) { setDraftErr("키워드를 입력하세요."); return; }
    if ((title || body) && !window.confirm("현재 작성 중인 제목·본문을 AI 초안으로 덮어쓸까요?")) return;
    setDrafting(true); setDraftErr(null);
    try {
      const r = await copilotDraft(keywords.trim());
      if (r.title) setTitle(r.title.slice(0, TITLE_MAX));
      setBody(r.body);
      setAiLabel("ai_generated"); // AI 초안 → 기자 수정 후 라벨 조정
      setPreview(false);
    } catch (e) {
      setDraftErr(e instanceof Error ? e.message : "초안 생성 실패");
    } finally {
      setDrafting(false);
    }
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 허용
    if (!file) return;
    if (!file.type.startsWith("image/")) { setUploadErr("이미지 파일만 가능합니다."); return; }
    if (file.size > 10 * 1024 * 1024) { setUploadErr("10MB 이하만 가능합니다."); return; }
    setUploading(true); setUploadErr(null);
    try {
      const { url } = await copilotUploadImage(file);
      // 캡션을 바로 받아 alt에 넣음(취재 맥락·저작권 표기). 비우면 안내 자리표시.
      const caption = (window.prompt("사진 설명(캡션)을 적어주세요. 예: 만리포 해수욕장 개장식 (사진=홍길동)") ?? "").trim();
      const alt = caption || "사진 설명을 적어주세요";
      setBody((b) => `${b}${b && !b.endsWith("\n") ? "\n\n" : ""}![${alt}](${url})\n\n`);
    } catch (err) {
      setUploadErr(err instanceof Error ? err.message : "업로드 실패");
    } finally {
      setUploading(false);
    }
  }

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* */ }
    setTitle(""); setBody(""); setAiLabel("human"); setSource("");
    setSavedAt(null); setRestored(false); setResult(null);
  }

  // 디바운스 실시간 점검
  useEffect(() => {
    if (!title && !body) {
      setCheck(null);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        setCheck(await copilotCheck(title, body));
      } catch {
        /* 점검 실패는 조용히 무시 */
      }
    }, 600);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [title, body]);

  // 서버에 초안 저장(생성 or 수정) → 기사 id 반환
  async function saveServer(): Promise<string | null> {
    const input = { title, body, aiLabel, sources: source ? [{ title: source }] : [] };
    if (articleId) { await updateArticle(articleId, input); return articleId; }
    const r = await createArticle(input);
    setArticleId(r.id);
    return r.id;
  }

  async function onSaveDraft() {
    setServerSaving(true);
    try { await saveServer(); setSavedAt(new Date().toISOString()); setRestored(false); }
    catch (e) { setUploadErr(e instanceof Error ? e.message : "저장 실패"); }
    finally { setServerSaving(false); }
  }

  async function submit() {
    setSubmitting(true);
    setResult(null);
    try {
      const id = await saveServer();
      if (!id) throw new Error("저장 실패");
      const r = await submitArticle(id);
      setResult({
        ok: r.ok, queued: r.queued, reviewId: r.reviewId,
        aiLabel, aiLabelText: r.aiLabelText, publishAllowed: r.publishAllowed,
        reasons: r.reasons, message: r.message,
      });
      if (r.queued) { try { localStorage.removeItem(DRAFT_KEY); } catch { /* */ } setSavedAt(null); setRestored(false); }
    } catch (e) {
      setResult({
        ok: false, queued: false, reviewId: "", aiLabel, aiLabelText: "",
        publishAllowed: false, reasons: [e instanceof Error ? e.message : "제출 실패"], message: "제출에 실패했습니다.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const needSource = aiLabel !== "human" && !source;
  const canSubmit = title.trim() && body.trim() && !needSource && !submitting;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Citizen Co-Pilot"
        title="시민기자 에디터"
        description="AI가 사실·맥락 확인과 거버넌스를 돕고, 편집부가 모든 글을 검토(HITL)합니다."
      />

      {/* 임시저장 상태 바 */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand/10 bg-brand/[0.02] px-3 py-2 text-xs">
        <span className="text-foreground-muted">
          {restored ? <><Icon name="doc" /> 임시저장 글을 불러왔습니다 · </> : ""}
          {savedAt ? `자동 저장됨 ${new Date(savedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}` : "작성하면 자동으로 임시저장됩니다"}
        </span>
        <div className="flex items-center gap-3">
          <Link href="/citizen/articles" className="text-foreground-muted hover:text-brand"><Icon name="clipboard" /> 내 기사</Link>
          <button type="button" onClick={onSaveDraft} disabled={serverSaving || (!title && !body)} className="font-semibold text-brand hover:underline disabled:opacity-40">
            {serverSaving ? "저장 중…" : <><Icon name="download" /> 초안 저장</>}
          </button>
          <button type="button" onClick={() => setPreview((v) => !v)} className="font-semibold text-accent hover:underline">
            {preview ? <><Icon name="pen" /> 작성으로</> : <><Icon name="eye" /> 미리보기</>}
          </button>
          {(title || body) && (
            <button type="button" onClick={() => { if (window.confirm("작성 중인 내용을 모두 지울까요?")) clearDraft(); }} className="text-foreground-muted hover:text-red-600">초기화</button>
          )}
        </div>
      </div>

      {/* 키워드로 AI 초안 생성 */}
      <section className="rounded-2xl border border-accent/30 bg-accent-subtle/20 p-4 space-y-2">
        <p className="text-sm font-bold text-brand">키워드로 초안 생성</p>
        <p className="text-xs text-foreground-muted">핵심 키워드 몇 개만 넣으면 AI가 기사 골격을 만들어 드립니다. <strong className="text-brand">초안을 직접 확인·수정</strong>하고, 수치·인용 등 <code className="rounded bg-brand/5 px-1">[확인 필요]</code> 부분을 취재로 채우세요.</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") generateDraft(); }}
            placeholder="예: 만리포 해수욕장 개장, 피서객, 주차 대책"
            aria-label="키워드"
            className="flex-1 rounded-lg border border-brand/20 bg-background px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button type="button" onClick={generateDraft} disabled={drafting} className="btn-accent shrink-0 disabled:opacity-50">
            {drafting ? "생성 중…" : "초안 생성"}
          </button>
        </div>
        {draftErr && <p className="text-xs text-red-600">{draftErr}</p>}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* 에디터 / 미리보기 */}
        <div className="space-y-4">
          {preview ? (
            <article className="min-h-[40vh] rounded-lg border border-brand/15 bg-background p-5">
              <h2 className="text-2xl font-bold text-brand">{title || "(제목 없음)"}</h2>
              <p className="mt-2 text-xs text-foreground-muted">미리보기 · 발행 시 편집부 검토를 거칩니다</p>
              <div className="mt-4 leading-relaxed text-foreground"><BodyPreview body={body} /></div>
            </article>
          ) : (
          <>
          <div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
              placeholder="기사 제목"
              aria-label="기사 제목"
              className="w-full border-b-2 border-brand/15 bg-transparent pb-2 text-2xl font-bold text-brand outline-none focus:border-accent"
            />
            <p className={`mt-1 text-right text-[11px] ${title.length >= TITLE_MAX ? "text-red-600" : "text-foreground-muted"}`}>{title.length}/{TITLE_MAX}</p>
          </div>
          <div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="본문을 입력하세요. 작성하는 동안 개인정보·민감주제를 실시간으로 확인합니다."
              aria-label="기사 본문"
              className="min-h-[40vh] w-full resize-y rounded-lg border border-brand/15 bg-background p-4 leading-relaxed outline-none focus:border-accent lg:min-h-[55vh]"
            />
            <div className="mt-1 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input ref={fileInput} type="file" accept="image/*" onChange={onPickImage} className="hidden" />
                <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading}
                  className="rounded-full border border-brand/20 px-3 py-1 text-xs font-medium text-brand hover:bg-brand/5 disabled:opacity-50">
                  {uploading ? "업로드 중…" : <><Icon name="image" /> 사진 추가</>}
                </button>
                <DataInsertButton onInsert={(text) => setBody((b) => `${b}${b && !b.endsWith("\n") ? "\n\n" : ""}${text}\n\n`)} />
                {uploadErr && <span className="text-[11px] text-red-600">{uploadErr}</span>}
              </div>
              <p className="text-[11px] text-foreground-muted">
                {body.length.toLocaleString()}자{body.length > 0 && body.length < 300 && " · 권장 300자↑"}
              </p>
            </div>
          </div>
          </>
          )}

          {/* AI 라벨 + 출처 */}
          <div className="rounded-lg border border-brand/15 bg-background p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-brand mb-1.5">AI 사용 정도 (라벨)</p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["human", "사람 작성"],
                    ["ai_assisted", "AI 보조"],
                    ["ai_generated", "AI 생성"],
                  ] as [AiLabel, string][]
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAiLabel(v)}
                    aria-pressed={aiLabel === v}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                      aiLabel === v ? "bg-brand text-background" : "border border-brand/20 text-foreground-muted"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {aiLabel !== "human" && (
              <div>
                <label className="text-sm font-semibold text-brand">출처 (AI 보조·생성 시 필수)</label>
                <input
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="예: 태안군 보도자료 / 현장 취재"
                  className="mt-1 w-full rounded border border-brand/20 px-2 py-1.5 text-sm"
                />
              </div>
            )}
          </div>

          <PreSubmitChecklist />

          <div className="sticky bottom-2 z-10 -mx-1 rounded-xl bg-background/90 px-1 py-2 backdrop-blur lg:static lg:bg-transparent lg:backdrop-blur-none">
            <button type="button" onClick={submit} disabled={!canSubmit} className="btn-accent w-full disabled:opacity-50 lg:w-auto">
              {submitting ? "제출 중…" : "편집부에 제출 (HITL 검수)"}
            </button>
            {needSource && <p className="mt-1 text-xs text-amber-600">AI 보조·생성 기사는 출처가 필요합니다.</p>}
          </div>

          {result && <SubmitPanel result={result} />}
        </div>

        {/* 코파일럿 사이드 */}
        <aside className="space-y-4">
          <GovernancePanel check={check} />
          <RelatedPanel title={title} body={body} />
          <AssistPanel body={body} onApply={(t) => setBody(t)} />
        </aside>
      </div>
    </div>
  );
}

// 본문 미리보기 — 마크다운 이미지 ![alt](url)는 사진으로, 나머지는 텍스트로 렌더
function BodyPreview({ body }: { body: string }) {
  if (!body) return <span className="text-foreground-muted">(본문 없음)</span>;
  const parts = body.split(/(!\[[^\]]*\]\([^)]+\))/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = p.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (m) {
          const alt = m[1] || "사진";
          return (
            <figure key={i} className="my-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m[2]} alt={alt} className="w-full rounded-lg border border-brand/10" loading="lazy" />
              {m[1] && <figcaption className="mt-1 text-center text-xs text-foreground-muted">{m[1]}</figcaption>}
            </figure>
          );
        }
        return <span key={i} className="whitespace-pre-wrap">{p}</span>;
      })}
    </>
  );
}

function GovernancePanel({ check }: { check: CheckResult | null }) {
  const clean = check && check.pii.count === 0 && check.sensitive.topics.length === 0;
  return (
    <section className="rounded-2xl border border-brand/15 bg-background p-4 space-y-3">
      <h2 className="text-sm font-bold text-brand">실시간 점검</h2>
      {!check && <p className="text-xs text-foreground-muted">작성을 시작하면 개인정보·민감주제를 확인합니다.</p>}
      {check && clean && <p className="text-sm text-green-700">✅ 감지된 위험 없음</p>}
      {check && !clean && (
        <div className="space-y-2">
          {check.pii.count > 0 && (
            <div className="rounded border border-amber-200 bg-amber-50 p-2.5 text-xs">
              <p className="font-semibold text-amber-800">개인정보 {check.pii.count}건</p>
              <p className="text-amber-700">{check.pii.kinds.map((k) => PII_LABELS[k] ?? k).join(", ")} · 발행 시 자동 마스킹</p>
              {check.pii.samples && check.pii.samples.length > 0 && (
                <ul className="mt-1.5 space-y-1">
                  {check.pii.samples.map((s, i) => (
                    <li key={`${s.matched}-${i}`} className="flex items-center gap-1.5">
                      <span className="rounded bg-amber-200/60 px-1 py-0.5 font-mono text-[11px] text-amber-900">{s.matched}</span>
                      <span className="text-amber-700">{PII_LABELS[s.kind] ?? s.kind}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {check.sensitive.topics.map((t) => (
            <div key={t.topic} className="rounded border border-red-200 bg-red-50 p-2.5 text-xs">
              <p className="font-semibold text-red-700">민감주제: {SENSITIVE_LABELS[t.topic] ?? t.topic}</p>
              <p className="text-red-600">키워드: {t.matched.join(", ")}</p>
            </div>
          ))}
          {check.sensitive.blockAiOnly && (
            <p className="text-xs font-semibold text-red-700">⚠️ AI 단독 발행 차단 — 편집장 직접 작성 필요</p>
          )}
          {check.sensitive.requiresHitl && !check.sensitive.blockAiOnly && (
            <p className="text-xs font-semibold text-amber-700">⚠️ 편집부 검토(HITL) 필수</p>
          )}
        </div>
      )}
      {check && <p className="text-[11px] text-foreground-muted">{check.chars}자 · 규칙 기반(무LLM)</p>}
    </section>
  );
}

function AssistPanel({ body, onApply }: { body: string; onApply: (text: string) => void }) {
  const [busy, setBusy] = useState<AssistMode | null>(null);
  const [out, setOut] = useState<{ mode: AssistMode; result: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(mode: AssistMode) {
    if (!body.trim()) {
      setErr("본문을 먼저 입력하세요.");
      return;
    }
    setBusy(mode);
    setErr(null);
    setOut(null);
    try {
      const r = await copilotAssist(mode, body);
      setOut({ mode, result: r.result });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "보조 실패");
    } finally {
      setBusy(null);
    }
  }

  const buttons: [AssistMode, string][] = [
    ["polish", "다듬기"],
    ["summarize", "요약"],
    ["title", "제목 추천"],
    ["factcheck", "사실 점검"],
  ];
  const buttonIcons: Record<AssistMode, "pen" | "write" | "idea" | "search"> = {
    polish: "pen",
    summarize: "write",
    title: "idea",
    factcheck: "search",
  };

  return (
    <section className="rounded-2xl border border-brand/15 bg-background p-4 space-y-3">
      <h2 className="text-sm font-bold text-brand">AI 글쓰기 보조</h2>
      <div className="flex flex-wrap gap-2">
        {buttons.map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => run(mode)}
            disabled={busy !== null}
            className="rounded-full border border-brand/20 px-3 py-1.5 text-sm text-brand hover:bg-brand/5 disabled:opacity-50"
          >
            {busy === mode ? "생성 중…" : <><Icon name={buttonIcons[mode]} /> {label}</>}
          </button>
        ))}
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      {out && (
        <div className="rounded-lg border border-accent/30 bg-accent-subtle/20 p-3 space-y-2">
          <p className="whitespace-pre-wrap text-sm text-foreground">{out.result}</p>
          {out.mode === "polish" && (
            <button
              type="button"
              onClick={() => onApply(out.result)}
              className="text-xs font-semibold text-accent hover:underline"
            >
              본문에 반영 →
            </button>
          )}
        </div>
      )}
      <p className="text-[11px] text-foreground-muted">Workers AI (Llama 3.3) · 무료 할당 내 종량 0 · 사실 점검은 본문에서 확인 대상만 추출(새 사실 창작 안 함)</p>
    </section>
  );
}

// 제출 전 작성 가이드 — 신참 시민기자용 자가점검(비강제). 교육(LMS) 전 인라인 가이드 역할.
const CHECKLIST_ITEMS = [
  "핵심(누가·언제·어디서·무엇을·왜·어떻게)을 리드 1~2문단에 먼저 담았다",
  "가장 중요한 사실부터 → 덜 중요한 순으로 배치했다(역피라미드)",
  "수치·날짜·이름·기관명을 취재로 확인했다(추측·전언 금지)",
  "한쪽 주장만 싣지 않고 관련자 입장·반론을 균형 있게 담았다",
  "개인정보(이름·연락처·주소)는 보도 필요 최소한으로, 사생활은 가렸다",
  "사진에 캡션과 촬영자(저작권)를 표기했다",
  "AI를 썼다면 라벨과 출처를 정확히 표시했다",
];
function PreSubmitChecklist() {
  const [done, setDone] = useState<boolean[]>(() => CHECKLIST_ITEMS.map(() => false));
  const count = done.filter(Boolean).length;
  return (
    <details className="rounded-lg border border-brand/15 bg-brand/[0.02] px-4 py-2 text-sm">
      <summary className="cursor-pointer font-semibold text-brand">
        ✅ 제출 전 작성 가이드 <span className="text-xs font-normal text-foreground-muted">({count}/{CHECKLIST_ITEMS.length})</span>
      </summary>
      <ul className="mt-2 space-y-1.5">
        {CHECKLIST_ITEMS.map((item, i) => (
          <li key={i}>
            <label className="flex items-start gap-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={done[i]}
                onChange={() => setDone((d) => d.map((v, j) => (j === i ? !v : v)))}
                className="mt-0.5 accent-accent"
              />
              <span className={done[i] ? "text-foreground-muted line-through" : ""}>{item}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-foreground-muted">자가점검용 안내입니다 · 체크하지 않아도 제출할 수 있어요(편집부가 최종 검토).</p>
    </details>
  );
}

// 관련 과거기사 — 제목·본문 주제로 태안신문 아카이브를 디바운스 검색(무LLM FTS5).
// 본문을 읽기 좋은 단락으로 — 줄바꿈 기준 분리, 한 덩어리면 문장 3개씩 묶어 단락화.
function paragraphize(text: string): string[] {
  const clean = text.replace(/\r/g, "").trim();
  if (!clean) return [];
  let paras = clean.split(/\n{2,}/).map((p) => p.replace(/\n+/g, " ").trim()).filter(Boolean);
  if (paras.length <= 1) paras = clean.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  // 여전히 한 덩어리로 길면 문장 단위로 잘라 3문장씩 묶음
  if (paras.length <= 1 && clean.length > 240) {
    const sentences = clean.split(/(?<=[.!?。…])\s+/).map((s) => s.trim()).filter(Boolean);
    paras = [];
    for (let i = 0; i < sentences.length; i += 3) paras.push(sentences.slice(i, i + 3).join(" "));
  }
  return paras.length ? paras : [clean];
}

function RelatedPanel({ title, body }: { title: string; body: string }) {
  const [items, setItems] = useState<RelatedArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [reading, setReading] = useState<ArchiveArticle | null>(null);
  const [readId, setReadId] = useState<number | null>(null);
  const [readLoading, setReadLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const seed = `${title} ${body}`.trim();
    if (seed.replace(/\s/g, "").length < 6) { setItems([]); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await copilotRelated(title, body.slice(0, 1200));
        setItems(r.items ?? []);
      } catch { /* 검색 실패는 조용히 무시 */ }
      finally { setLoading(false); }
    }, 900);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [title, body]);

  // 같은 창에서 보기 — 클릭한 기사 아래로 본문을 펼침(아코디언). 다시 누르면 접힘.
  async function toggleReader(idxno: number) {
    if (readId === idxno) { setReadId(null); setReading(null); return; }
    setReadId(idxno); setReadLoading(true); setReading(null);
    try { setReading(await getArchiveArticle(idxno)); }
    catch { setReading(null); }
    finally { setReadLoading(false); }
  }

  return (
    <section className="rounded-2xl border border-brand/15 bg-background p-4 space-y-3">
      <h2 className="text-sm font-bold text-brand">관련 과거 보도</h2>
      {!items.length && (
        <p className="text-xs text-foreground-muted">
          {loading ? "태안신문 아카이브 검색 중…" : "주제를 입력하면 태안신문이 다룬 과거 기사를 찾아드립니다. 맥락·중복·후속취재 확인용."}
        </p>
      )}
      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((a) => {
            const open = readId === a.idxno;
            return (
              <li key={a.idxno}>
                <button type="button" onClick={() => toggleReader(a.idxno)}
                  aria-expanded={open}
                  className={`block w-full text-left rounded-lg border p-2.5 transition-colors ${open ? "border-accent bg-accent-subtle/20" : "border-brand/10 hover:border-accent/40 hover:bg-accent-subtle/10"}`}>
                  <p className="text-sm font-semibold text-brand leading-snug">{a.title}</p>
                  <p className="mt-0.5 text-[11px] text-foreground-muted">
                    {a.publishedAt ? a.publishedAt.slice(0, 10) : ""}{a.category ? ` · ${a.category}` : ""}
                    <span className="ml-1 text-accent">{open ? "▲ 접기" : "▼ 본문 보기"}</span>
                  </p>
                  {!open && a.excerpt && <p className="mt-1 line-clamp-2 text-xs text-foreground-muted">{a.excerpt}</p>}
                </button>

                {open && (
                  <div className="mt-1 rounded-lg border border-accent/20 bg-accent-subtle/5 p-3">
                    {readLoading && <p className="text-xs text-foreground-muted">본문 불러오는 중…</p>}
                    {reading && (
                      <>
                        {reading.faithfulness != null && reading.faithfulness < 0.7 && (
                          <p className="mb-2 rounded bg-amber-50 p-1.5 text-[11px] text-amber-700">※ 옛 신문 OCR 본문이라 오탈자가 있을 수 있습니다.</p>
                        )}
                        <div className="max-h-80 space-y-2.5 overflow-y-auto text-xs leading-relaxed text-foreground">
                          {paragraphize(reading.body || reading.excerpt || "(본문 없음)").map((p, i) => (
                            <p key={i}>{p}</p>
                          ))}
                        </div>
                        <Link href={`/news/${reading.idxno}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[11px] font-semibold text-accent hover:underline">원문 페이지 새 탭으로 →</Link>
                      </>
                    )}
                    {!readLoading && !reading && <p className="text-xs text-foreground-muted">본문을 불러오지 못했습니다.</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {items.length > 0 && <p className="text-[11px] text-foreground-muted">제목을 누르면 본문이 아래로 펼쳐집니다 · 규칙 기반 검색(무LLM)</p>}
    </section>
  );
}

// 실시간 데이터 넣기 — 날씨·물때·해넘이를 출처와 함께 본문에 끼워넣는다(공공데이터).
function DataInsertButton({ onInsert }: { onInsert: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [blocks, setBlocks] = useState<ContextBlock[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function toggle() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (blocks) return;
    setLoading(true); setErr(null);
    try {
      const r = await copilotContextData();
      setBlocks(r.blocks ?? []);
      if (!r.available) setErr("지금은 가져올 실시간 데이터가 없습니다.");
    } catch {
      setErr("데이터를 불러오지 못했습니다.");
    } finally { setLoading(false); }
  }

  return (
    <div className="relative">
      <button type="button" onClick={toggle}
        className="rounded-full border border-brand/20 px-3 py-1 text-xs font-medium text-brand hover:bg-brand/5">
<Icon name="chart" /> 데이터 넣기
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-lg border border-brand/15 bg-background p-2 shadow-lg">
          {loading && <p className="px-2 py-1 text-xs text-foreground-muted">불러오는 중…</p>}
          {err && <p className="px-2 py-1 text-xs text-amber-600">{err}</p>}
          {blocks?.map((b) => (
            <button key={b.id} type="button"
              onClick={() => { onInsert(b.markdown); setOpen(false); }}
              className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-brand/5">
              <span className="text-xs font-semibold text-brand">{b.label}</span>
              <span className="mt-0.5 block text-[11px] text-foreground-muted line-clamp-2">{b.markdown}</span>
            </button>
          ))}
          {blocks && blocks.length === 0 && !err && (
            <p className="px-2 py-1 text-xs text-foreground-muted">표시할 데이터가 없습니다.</p>
          )}
        </div>
      )}
    </div>
  );
}

function SubmitPanel({ result }: { result: SubmitResult }) {
  return (
    <div
      className={`rounded-2xl border p-5 space-y-2 ${
        result.queued ? "border-accent/40 bg-accent-subtle/20" : "border-red-200 bg-red-50"
      }`}
    >
      <p className="font-semibold text-brand">
        {result.queued ? "✅ 검수 큐에 등록됨" : "제출 결과"}
      </p>
      {result.aiLabelText && (
        <p className="text-sm">
          AI 라벨: <strong className="text-brand">{result.aiLabelText}</strong> · 발행 가능:{" "}
          {result.publishAllowed ? "예" : "보류(편집부 검토 후)"}
        </p>
      )}
      <p className="text-sm text-foreground-muted">{result.message}</p>
      {result.reasons.length > 0 && (
        <ul className="text-xs text-foreground-muted list-disc pl-4">
          {result.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <Link href="/admin" className="inline-block text-sm font-semibold text-accent hover:underline">
        편집부 검수 큐 보기 →
      </Link>
    </div>
  );
}
