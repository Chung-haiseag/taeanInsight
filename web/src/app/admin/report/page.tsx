"use client";

// 관리자 "보고서" — 운영 핸드북. 프로젝트 개요 + 운영 정보(접속주소·서버설정·내부 설정값·회원현황).
//   탭 배열에 항목만 추가하면 확장. 세션 admin 게이트(비밀값은 표시하지 않음 — 이름·설정 여부만).

import { useEffect, useState } from "react";
import Link from "next/link";

import { getSession, type Account } from "@/lib/api/auth";
import { hasRole } from "@/lib/roles";
import { getUsers, getJobs, type AdminUser, type JobStatus } from "@/lib/api/admin";
import { getReportSummary, getAdminSettings, setAdminSettings, type ReportSummary } from "@/lib/api/report";

// ※ 비용·성과·전환·구독·시스템 상태(지표)는 관리자 대시보드(/admin)로 일원화. 보고서는 문서·운영 현황.
type ReportTab = "overview" | "tech" | "ops" | "roadmap" | "runbook" | "jobs" | "data" | "changelog";
const TABS: { key: ReportTab; label: string }[] = [
  { key: "overview", label: "프로젝트 개요" },
  { key: "tech", label: "🧠 AI·기술" },
  { key: "ops", label: "운영 정보" },
  { key: "roadmap", label: "🗺 로드맵" },
  { key: "runbook", label: "🚀 운영 절차" },
  { key: "jobs", label: "⚙️ 자동화" },
  { key: "data", label: "📦 데이터 지도" },
  { key: "changelog", label: "🧾 개발 연혁" },
];

function renderTab(tab: ReportTab) {
  switch (tab) {
    case "overview": return <ProjectOverview />;
    case "tech": return <TechOverview />;
    case "ops": return <OperationsInfo />;
    case "roadmap": return <Roadmap />;
    case "runbook": return <Runbook />;
    case "jobs": return <JobsSection />;
    case "data": return <DataSnapshot />;
    case "changelog": return <Changelog />;
  }
}

export default function AdminReportPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [tab, setTab] = useState<ReportTab>("overview");

  useEffect(() => {
    (async () => {
      const acct = await getSession().catch(() => null);
      setAccount(acct);
      if (acct && hasRole(acct.role, "admin")) { setAuthed(true); return; }
      // 세션 admin이 아니면 저장된 관리자 토큰으로 폴백 검증(비상용)
      try { await getUsers(); setAuthed(true); } catch { setAuthed(false); }
    })();
  }, []);

  if (authed === null) return <p className="p-6 text-sm text-foreground-muted">확인 중…</p>;
  if (!authed)
    return (
      <div className="mx-auto max-w-sm space-y-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-brand">🔒 관리자 전용</h1>
        {account ? (
          <p className="text-sm text-foreground-muted">이 계정({account.email})은 관리자 권한이 없습니다.</p>
        ) : (
          <p className="text-sm text-foreground-muted">관리자 계정으로 로그인하세요.</p>
        )}
        <Link href="/login?redirect=/admin/report" className="btn-accent inline-flex px-4 py-2 text-sm">로그인</Link>
      </div>
    );

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-brand">📄 보고서</h1>
        <p className="text-foreground-muted">운영 핸드북 — 프로젝트 개요·접속주소·서버설정·내부 설정값. 탭은 계속 확장됩니다.</p>
      </header>

      <div className="flex flex-wrap gap-1.5 border-b border-brand/15 pb-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? "page" : undefined}
            className={`rounded-t px-3.5 py-2 text-sm font-semibold transition-colors ${
              tab === t.key ? "bg-brand text-background" : "text-foreground-muted hover:bg-foreground-muted/10"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {renderTab(tab)}
    </div>
  );
}

// ── 공용 프레젠테이션 ──────────────────────────────────────────
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-brand/15 bg-background p-4">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-brand">{title}</h2>
      {children}
    </section>
  );
}

function KV({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[10rem_1fr] text-sm">
      {rows.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-foreground-muted">{k}</dt>
          <dd className="font-medium text-foreground break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const code = (s: string) => <code className="rounded bg-foreground-muted/10 px-1.5 py-0.5 text-xs">{s}</code>;

// ── ① 프로젝트 개요 ────────────────────────────────────────────
function ProjectOverview() {
  return (
    <div className="space-y-4">
      <Card title="한 줄 소개">
        <p className="text-sm leading-relaxed">
          <strong className="text-brand">태안 인사이트</strong> — 주간태안신문의 지역 AI 인텔리전스 플랫폼.
          지역 뉴스·기록을 디지털화하고, 공공데이터와 아카이브를 근거로 AI가 질문에 답하며, 회원 등급 기반으로 시민 참여·투고를 운영한다.
        </p>
      </Card>

      <Card title="배경 & 목적">
        <ul className="space-y-1.5 text-sm">
          <li>· <strong>문제</strong>: 지역 신문이 수십 년 쌓은 기록·데이터가 검색·활용되지 못하고, 지역 저널리즘은 지속가능성 압박을 받는다.</li>
          <li>· <strong>해법</strong>: 옛 지면까지 디지털화해 <strong>검색·질의 가능한 지역 지식베이스</strong>로 만들고, 공공데이터·실시간 정보와 결합해 주민에게 실용 답을 준다.</li>
          <li>· <strong>지향</strong>: AI가 <strong>출처를 밝히고 근거로만</strong> 답해 신뢰를 지키며, 시민이 직접 취재·투고하는 <strong>참여형 지역 미디어</strong>로 확장.</li>
        </ul>
      </Card>

      <Card title="대상 & 차별점">
        <KV
          rows={[
            ["주 대상", <>태안 주민·관광객 · 기자/시민기자 · 지역 기관</>],
            ["차별점", <>전국 범용 AI가 아닌 <strong>태안 특화 근거</strong>(아카이브+공공데이터+<strong>지식그래프 온톨로지</strong>)에 출처 표기·지어내기 방지</>],
            ["비용 구조", <>Cloudflare 종량(무료 티어 중심)·Workers AI로 <strong>저비용 운영</strong>, 고가 API 지양</>],
            ["운영 주체", <>주간태안신문</>],
          ]}
        />
      </Card>

      <Card title="기술 스택">
        <KV
          rows={[
            ["백엔드", <>Cloudflare Workers + Hono ({code("taean-insight-api")})</>],
            ["프론트", <>Next.js + OpenNext on Workers ({code("taean-insight")})</>],
            ["데이터", <>D1(SQLite) · R2(오브젝트) · Vectorize(벡터) · Workers AI</>],
            ["LLM", <>Workers AI {code("llama-3.3-70b")}(질의·copilot) · Gemini(디지털화)</>],
            ["방침", <>Cloudflare 전용 · Firebase 미사용(W3C Web Push) · 운영 Worker는 Claude API 미사용</>],
          ]}
        />
      </Card>

      <Card title="핵심 기능">
        <ul className="space-y-1.5 text-sm">
          <li>🔎 <strong>AI 질의응답</strong> — 아카이브 RAG(FTS5+의미검색) + 실시간 근거(날씨·대기질·관광) + <strong>지식그래프 검증 사실</strong>로 출처 표기</li>
          <li>🕸 <strong>지식그래프 온톨로지</strong> — 인물·조직·사건·정책·장소·품목 6종 개체 + 관계, <strong>검증(verified) 사실만</strong> 답변 근거(지어내기 방지)</li>
          <li>📊 <strong>예측 인사이트</strong> — 낚시 출조·낙조·제철·해무·미세먼지·개화·위판 시세/추세·산불·영농·양식 등 조건부 경보·예보</li>
          <li>📍 <strong>실시간 현황(/live)</strong> · 🗺 <strong>공개 데이터 지도(/data)</strong> — 지금 태안 한눈에 + 데이터 소스·온톨로지 투명 공개</li>
          <li>📰 <strong>뉴스 아카이브 · 인물 탐색(/people)</strong> — 자사·지역언론 수집, 전문 검색, 관계망·AI 전기</li>
          <li>🖨 <strong>지면 디지털화</strong> — 1990~2001 옛 지면 OCR→기사화(Google Vision + Gemini)</li>
          <li>👥 <strong>회원 등급 시스템</strong> — 비로그인·회원·시민기자·기자·관리자·최종관리자 6계층</li>
          <li>🖊 <strong>시민기자 투고</strong> — 신청·승인 후 <code className="text-xs">/write</code>에서 AI 보조 작성→검수 큐</li>
          <li>📅 <strong>주간 리포트·오디오</strong> — 자동 생성 리포트 + 나레이션(Gemini)</li>
          <li>📡 <strong>취재 레이더·알림</strong> — 개체별 보도공백·군청공지·특보·데이터 급변·키워드 → 기자 Web Push</li>
        </ul>
      </Card>

      <Card title="현황(2026-08)">
        <ul className="space-y-1 text-sm text-foreground-muted">
          <li>· 공개 도메인 <strong>axtaeannews.co.kr</strong> 라이브(Cloudflare).</li>
          <li>· 지식그래프 <strong>온톨로지 Phase 1~3 완결</strong> — 개체 6종·관계 8종, 검증 사실을 AI 답변 근거로 통합.</li>
          <li>· 예측 인사이트 대량 라이브(날씨·바다·수산·농업·안전) + 관광 수요지수 실측 보정.</li>
          <li>· 회원 등급 시스템(Plan 1~4)·지면 디지털화 1990~2001 전량 라이브.</li>
          <li>· 검수 대기: 소속·축제 후보(관리자 승인 시 AI 근거 자동 확대).</li>
        </ul>
      </Card>
    </div>
  );
}

// ── 🧠 AI·기술 ─────────────────────────────────────────────────
const PIPELINE = ["질의", "의도 이해", "하이브리드 검색", "＋ 지식그래프", "＋ 실시간 근거", "근거 결합 생성", "교열·차트", "출처 표기"];
const GLOSSARY: [string, string][] = [
  ["RAG", "검색증강생성 — 외부 근거를 찾아 그 근거로만 답하게 하는 방식. 환각을 줄이고 출처를 붙일 수 있다."],
  ["FTS5 트라이그램", "SQLite 전문검색. 세 글자 단위 색인이라 한국어 형태소 분석 없이도 부분일치가 잘 된다."],
  ["임베딩 / bge-m3", "문장을 1024차원 벡터로 바꿔 '의미가 가까운' 글을 찾게 하는 다국어 모델."],
  ["RRF", "Reciprocal Rank Fusion — 키워드 순위와 의미 순위를 순위 기반으로 합치는 융합법."],
  ["GraphRAG", "지식그래프(인물·관계)를 RAG에 얹어, 검색만으로 안 잡히는 '관계·맥락' 근거까지 답변에 넣는 접근."],
  ["온톨로지", "개체 종류(인물·조직·사건·정책…)와 관계(소속·주관·추진…)를 정의한 지식 스키마. 흩어진 데이터를 사람이 이해하는 개념으로 묶어 AI 답변·행동의 뼈대로 쓴다(팔란티어 Foundry와 같은 접근)."],
  ["verified(2층)", "사람이 검수해 사실로 확정한 데이터(사실층). 자동추출분(탐색층, verified=0)은 통계·탐색에만, 답변 근거·라벨에는 verified만 신뢰해 주입한다."],
];

function Flow({ steps }: { steps: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto text-xs">
      {steps.map((s, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <span className="whitespace-nowrap rounded-full border border-accent/40 bg-accent/5 px-2.5 py-1 font-medium text-brand">{s}</span>
          {i < steps.length - 1 && <span className="text-foreground-muted" aria-hidden="true">→</span>}
        </span>
      ))}
    </div>
  );
}

function TechOverview() {
  return (
    <div className="space-y-4">
      <Card title="설계 철학">
        <p className="text-sm leading-relaxed">
          답변은 <strong className="text-brand">근거 기반 생성(Grounded RAG)</strong>이 원칙이다. 모델이 아는 것을 바로 말하게 두지 않고, 먼저 <strong>검색으로 근거를 모아</strong> 그 근거만으로 답하게 하며, 문장이 인용한 근거를 <strong>출처로 표기</strong>한다. 지역 뉴스·공공데이터라는 사실성이 중요한 도메인에서 <strong>환각(없는 사실 지어내기)</strong>을 억제하고 신뢰를 확보하기 위한 선택이다.
        </p>
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-semibold text-foreground-muted">질의 처리 흐름</p>
          <Flow steps={PIPELINE} />
        </div>
      </Card>

      <Card title="① 검색(Retrieval) — 하이브리드">
        <ul className="space-y-1.5 text-sm">
          <li>· <strong>질의 정규화</strong>: 조사 제거·지역어(태안 등) 희석·대화체 메타어(요즘·최근·근황) 정리로 검색 신호를 또렷하게</li>
          <li>· <strong>키워드 검색</strong>: D1 {code("archive_fts")} <strong>FTS5 트라이그램</strong> — 형태소 분석 없이도 부분일치·오탈자에 강함</li>
          <li>· <strong>의미 검색</strong>: Vectorize {code("bge-m3")} 1024차원 임베딩(아카이브 본문충실 ~59k건 백필, cosine 유사도)</li>
          <li>· <strong>RRF 융합</strong>: 키워드 순위 + 의미 순위를 Reciprocal Rank Fusion으로 결합(cosine 하한 0.5) → 정확 매칭과 맥락 매칭의 장점을 동시에</li>
        </ul>
      </Card>

      <Card title="② 지식그래프 온톨로지 (GraphRAG + Foundry식 온톨로지)">
        <ul className="space-y-1.5 text-sm">
          <li>· <strong>개체 6종·관계 8종</strong>({code("kg_ontology")} 데이터 주도): 인물(~3.4만)·조직·사건·정책·장소·품목 + 공동등장(~127만)·소속·주관·추진·개최지·역임·취급·관련</li>
          <li>· <strong>구축</strong>: 인물 NER(Gemini)·공동등장 집계 + 소속(인물→조직)·축제(사건)를 <strong>결정론 규칙으로 아카이브에서 자동추출</strong>(직함 큐·성씨 사전·근거 문장)</li>
          <li>· <strong>2층 구조(지어내기 방지)</strong>: 탐색층(verified=0, 통계·관계망만) vs 사실층(verified=1, 검수 통과). <strong>AI 답변 근거·라벨은 verified=1만</strong></li>
          <li>· <strong>검수·승격</strong>: 관리자 <code className="text-xs">/admin/kg</code>(소속·축제·관계 검수, 취재 레이더). 승격할수록 근거 확대 — 예: 승격된 소속 "가세로 → 태안군청(군수)"이 답변에 인용</li>
          <li>· <strong>답변 주입</strong>: 질의에서 인물·조직·사건·정책 감지 → 검증된 사실·관계를 근거로("튤립축제 주관 태안군청·개최지 코리아플라워파크", "가로림만 조력발전 무산")</li>
        </ul>
      </Card>

      <Card title="③ 근거 소스(Evidence) — 다중 결합">
        <ul className="space-y-1.5 text-sm">
          <li>· <strong>아카이브</strong>(하이브리드 검색) + <strong>실시간</strong>(기상청 동네예보·에어코리아 대기질·관광·KHOA 해상·오피넷 유가)</li>
          <li>· <strong>큐레이션 팩트</strong>: 역대 군수·역대/현직 군의원(선거구·연락처) 등 사람이 검증한 fact table</li>
          <li>· <strong>지역언론</strong>(충남일보·디트뉴스24·충청투데이 RSS) + <strong>내 가게</strong> 맞춤 근거(로그인 업종 기반)</li>
          <li>· <strong>웹 보강</strong>: 최신·상황 질문이거나 로컬 근거가 약할 때만(needsWeb 게이트) 네이버/Tavily 검색, 6h 캐시·fail-open</li>
          <li>· 답변이 <code className="text-xs">[번호]</code>로 <strong>인용한 근거만</strong> 출처로 노출(토픽형은 웹 표시, 일반 질의는 공식 근거로)</li>
        </ul>
      </Card>

      <Card title="④ 생성 & 지어내기 방지">
        <ul className="space-y-1.5 text-sm">
          <li>· <strong>근거만 사용</strong>: verified 팩트만 신뢰, 근거 없으면 "찾지 못함" — 없는 사실을 만들지 않음</li>
          <li>· <strong>현재 날짜 주입</strong>(KST): 지난 일을 "예측/가능성"으로 답하던 모순 제거 → 과거는 사실, 예측은 미래에만</li>
          <li>· <strong>지역 이탈 안내</strong>: 태안과 무관한 질의는 범위를 벗어났음을 밝힘</li>
        </ul>
      </Card>

      <Card title="⑤ 품질·후처리">
        <ul className="space-y-1.5 text-sm">
          <li>· <strong>붕괴·외국문자 방지</strong>: 반복·비한글 누수 응답을 감지해 재생성(salad 게이트), 최후엔 잔여 한자·가나만 제거해 정상화</li>
          <li>· <strong>근거 대조 교열</strong>: fp8 양자화 모델이 흘린 연도·숫자를 근거와 대조해 복원(예: '개발은년부터'→'1997년부터')</li>
          <li>· <strong>결정론 정리</strong>: 문단·불릿 구조화, 빈 대괄호 제거 등 읽기 좋게 다듬기</li>
          <li>· <strong>자동 시각화</strong>: 답변 속 수치를 결정론 파싱해 월별·연도별·읍면별 막대차트로(LLM 없이·무료·안정). 인쇄/PDF는 워터마크·페이지여백 재사용</li>
        </ul>
      </Card>

      <Card title="⑥ 오케스트레이션 & ⑦ 모델·비용">
        <ul className="space-y-1.5 text-sm">
          <li>· <strong>경량 그래프 엔진</strong>({code("runGraph")}): 이해→아카이브→실시간→웹→작성→교정→마무리 노드, {code("when")} 조건 분기, 노드별 <strong>실시간 진행률</strong> 표시(가짜 시간추정 대체)</li>
          <li>· <strong>근거 파리티</strong>: 메인 경로와 그래프 경로가 같은 build*Evidence 헬퍼를 공유해 드리프트 0</li>
          <li>· <strong>모델</strong>: Workers AI {code("llama-3.3-70b")}(질의·copilot, 종량 0) · Gemini Flash-Lite(디지털화·라벨링, thinking off) · 임베딩 bge-m3</li>
          <li>· <strong>방침</strong>: 운영 Worker는 Claude API 미사용 — 무료·저가 우선. 대량 작업은 체크포인트·재시도(지수 백오프)로 안정화</li>
        </ul>
      </Card>

      <Card title="용어">
        <dl className="space-y-2 text-sm">
          {GLOSSARY.map(([term, desc]) => (
            <div key={term}>
              <dt className="font-semibold text-brand">{term}</dt>
              <dd className="text-foreground-muted">{desc}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}

// ── ② 운영 정보 ────────────────────────────────────────────────
const APP_URL = "https://axtaeannews.co.kr";
const API_URL = "https://taean-insight-api.chs9182.workers.dev";

const SECRETS = [
  ["TAEAN_ID / TAEAN_PW", "태안신문 회원 로그인(기사 전문 수집)"],
  ["DATA_GO_KR_KEY", "공공데이터(날씨·대기질·부동산·관광)"],
  ["NAVER_CLIENT_ID / SECRET", "네이버 검색·데이터랩"],
  ["OPINET_KEY", "유가(오피넷)"],
  ["GOV_IMPORT_TOKEN", "관공서 카드뉴스 수집"],
  ["SLACK_WEBHOOK_URL", "운영 알림"],
  ["VAPID_PRIVATE_KEY", "Web Push 서명"],
  ["ADMIN_TOKEN", "관리자 비상 접근 토큰(세션 admin 우선)"],
];

const CONFIG_VARS = [
  ["MONTHLY_COST_LIMIT_KRW", "월 비용 상한(경고)"],
  ["ALERT_THRESHOLDS", "데이터 급변 알림 임계값"],
  ["TAEAN_NX / TAEAN_NY", "기상청 동네예보 격자 좌표"],
  ["TAEAN_AIR_STATION", "대기질 측정소명"],
  ["TAEAN_LAWD_CD", "법정동 코드(부동산 실거래)"],
  ["VAPID_PUBLIC_KEY / SUBJECT", "Web Push 공개키·주체"],
];

function OperationsInfo() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    getUsers().then((r) => setUsers(r.users)).catch((e) => setErr(e instanceof Error ? e.message : "불러오기 실패"));
  }, []);

  const roleCount = countBy(users, (u) => u.role);
  const planCount = countBy(users, (u) => u.plan);

  return (
    <div className="space-y-4">
      <PublicPeopleToggle />
      <Card title="접속 주소">
        <KV
          rows={[
            ["공개 앱", <a href={APP_URL} target="_blank" rel="noopener noreferrer" className="text-accent underline">{APP_URL}</a>],
            ["백엔드 API", <a href={API_URL} target="_blank" rel="noopener noreferrer" className="text-accent underline">{API_URL}</a>],
            ["관리자 콘솔", <>{code("/admin")} · {code("/admin/kg")} · {code("/admin/report")}</>],
            ["운영 도메인", <span className="text-foreground-muted">axtaeannews.co.kr (라이브·Cloudflare) · API taean-insight-api.chs9182.workers.dev</span>],
          ]}
        />
      </Card>

      <Card title="데이터 흐름">
        <div className="mb-2"><Flow steps={["수집", "저장", "처리", "서빙"]} /></div>
        <ul className="space-y-1.5 text-sm">
          <li>· <strong>수집</strong>: 자사 RSS·기사목록(회원 세션 전문) · 지역언론 RSS · 공공데이터 API · 관공서 크롤 · 지면 PDF (크론·수동)</li>
          <li>· <strong>저장</strong>: D1(기사·회원·KG·팩트) · R2(지면·사진·오디오) · Vectorize(임베딩)</li>
          <li>· <strong>처리</strong>: 임베딩 백필 · 인물/관계 추출 · OCR→기사화 · 주간 리포트·오디오 생성</li>
          <li>· <strong>서빙</strong>: AI 질의(RAG) · 아카이브 검색 · 리포트 · Web Push 알림</li>
        </ul>
      </Card>

      <Card title="권한 · 보안 모델">
        <ul className="space-y-1.5 text-sm">
          <li>· <strong>6계층 role</strong>: 비로그인 · user · citizen · reporter · admin · superadmin (누적 권한)</li>
          <li>· <strong>인증</strong>: 이메일+비번(PBKDF2)·카카오 SSO → 불투명 세션 토큰. 관리자 API는 세션 role(admin+) 또는 비상 토큰</li>
          <li>· <strong>이중 방어</strong>: 메뉴·라우트는 클라이언트 가드(UX), 민감 데이터는 서버가 강제(adminGuard·역할 검증)</li>
          <li>· <strong>시크릿</strong>: Worker 시크릿으로만 보관·평문 미노출. 임명은 최종관리자, 강등 보호로 상위 계정 안전</li>
        </ul>
      </Card>

      <Card title="외부 연동(데이터 소스)">
        <ul className="space-y-1 text-sm text-foreground-muted">
          <li>· <strong>기상청</strong> 동네예보 · <strong>에어코리아</strong> 대기질 · <strong>data.go.kr</strong> 관광·부동산(실거래)</li>
          <li>· <strong>KHOA</strong> 바다누리 해상 · <strong>오피넷</strong> 유가 · <strong>ITS</strong> 도로 CCTV</li>
          <li>· <strong>네이버/Tavily</strong> 웹 검색 · <strong>카카오</strong> 로그인 · <strong>태안신문</strong>(자사 RSS·전문)</li>
          <li className="text-xs">실시간 연결 상태는 🩺 시스템 상태 탭 참고.</li>
        </ul>
      </Card>

      <Card title="서버 구성(바인딩)">
        <KV
          rows={[
            ["Workers", <>{code("taean-insight")}(프론트) · {code("taean-insight-api")}(백엔드)</>],
            ["D1", <>{code("ARCHIVE_DB")} → taean-archive (기사·검색·회원·세션·KG·시민기자신청·팩트 등)</>],
            ["R2", <>{code("ARCHIVE_PHOTOS")} → taean-archive-photos (지면·사진·오디오·군수사진)</>],
            ["Vectorize", <>{code("VECTORIZE")} → taean-articles (bge-m3 1024d 의미검색)</>],
            ["Workers AI", <>{code("AI")} → llama-3.3-70b (질의·copilot)</>],
            ["Cron", <>{code("0 15 * * *")}(자정 KST 뉴스·환경·비용) 외 6개 스케줄</>],
          ]}
        />
      </Card>

      <Card title="시크릿 (값 미표시 — 이름·용도만)">
        <p className="mb-2 text-xs text-red-600">⚠️ 실제 값은 Worker 시크릿으로만 보관하며 이 화면에 절대 표시하지 않습니다.</p>
        <ul className="space-y-1 text-sm">
          {SECRETS.map(([name, use]) => (
            <li key={name} className="flex flex-wrap items-baseline gap-2">
              <span className="rounded bg-foreground-muted/10 px-1.5 py-0.5 font-mono text-xs">{name}</span>
              <span className="text-foreground-muted">{use}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="설정값(비민감 vars)">
        <ul className="space-y-1 text-sm">
          {CONFIG_VARS.map(([name, use]) => (
            <li key={name} className="flex flex-wrap items-baseline gap-2">
              <span className="rounded bg-foreground-muted/10 px-1.5 py-0.5 font-mono text-xs">{name}</span>
              <span className="text-foreground-muted">{use}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="내부 상수">
        <KV
          rows={[
            ["역할 등급", <>user(0) &lt; citizen(1) &lt; reporter(2) &lt; admin(3) &lt; superadmin(4)</>],
            ["임명 규칙", <>superadmin→전부 · admin→user·citizen · 시민기자=신청→관리자 승인</>],
            ["플랜", <>free · reader · business · org</>],
            ["DB 마이그레이션", <>최신 {code("036")}(citizen_applications)</>],
            ["전자북 idxno", <>90000001~90099999 (지면이미지 R2 {code("ebook/<날짜>/page_NN.jpg")})</>],
            ["디지털화 라이브", <>1990~2001</>],
            ["검색", <>FTS5 트라이그램 + Vectorize RRF 병합(cosine 하한 0.5)</>],
          ]}
        />
      </Card>

      <Card title="회원 현황(라이브)">
        {err ? (
          <p className="text-sm text-red-600">{err}</p>
        ) : users === null ? (
          <p className="text-sm text-foreground-muted">불러오는 중…</p>
        ) : (
          <div className="space-y-3 text-sm">
            <p>총 <strong className="text-brand">{users.length}</strong>명</p>
            <div>
              <p className="mb-1 text-xs font-semibold text-foreground-muted">등급별</p>
              <div className="flex flex-wrap gap-2">
                {["user", "citizen", "reporter", "admin", "superadmin"].map((r) => (
                  <span key={r} className="rounded-full border border-brand/15 bg-brand/5 px-3 py-1">
                    {ROLE_LABEL[r] ?? r} <strong className="text-brand">{roleCount[r] ?? 0}</strong>
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-foreground-muted">플랜별</p>
              <div className="flex flex-wrap gap-2">
                {["free", "reader", "business", "org"].map((p) => (
                  <span key={p} className="rounded-full border border-brand/15 bg-brand/5 px-3 py-1">
                    {PLAN_LABEL[p] ?? p} <strong className="text-brand">{planCount[p] ?? 0}</strong>
                  </span>
                ))}
              </div>
            </div>
            <p className="text-xs text-foreground-muted">전체 회원 관리·등급 부여는 <code className="text-[11px]">/admin</code> 👥회원 탭에서.</p>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── 공개 기능 토글(superadmin 전용) ───────────────────────────
function PublicPeopleToggle() {
  const [on, setOn] = useState<boolean | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getSession().then((a) => setRole(a?.role ?? null)).catch(() => {});
    getAdminSettings().then((s) => setOn(s.publicPeople)).catch(() => {});
  }, []);
  if (role !== "superadmin") return null; // 최종관리자만 노출
  async function toggle() {
    if (on === null) return;
    setBusy(true);
    try { const r = await setAdminSettings({ publicPeople: !on }); setOn(r.publicPeople); }
    catch { /* 권한/네트워크 오류 무시 */ } finally { setBusy(false); }
  }
  return (
    <section className="rounded-lg border border-accent/30 bg-accent/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-brand">공개 기능 — 인물 탐색(/people)</h2>
          <p className="mt-0.5 text-xs text-foreground-muted">
            독자에게 {on === null ? "…" : on ? <strong className="text-green-700">공개 중</strong> : <strong className="text-foreground">감춤</strong>}.
            데이터는 유지되고 노출만 즉시 제어됩니다(배포 불필요, 네비 반영 ~30초).
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={busy || on === null}
          className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors disabled:opacity-60 ${
            on ? "bg-green-600 text-white hover:bg-green-700" : "bg-foreground-muted/20 text-foreground hover:bg-foreground-muted/30"
          }`}
        >
          {busy ? "…" : on ? "끄기(감추기)" : "켜기(공개)"}
        </button>
      </div>
    </section>
  );
}

const ROLE_LABEL: Record<string, string> = { user: "일반", citizen: "시민기자", reporter: "기자", admin: "관리자", superadmin: "최종관리자" };
const PLAN_LABEL: Record<string, string> = { free: "무료", reader: "독자", business: "비즈니스", org: "기관" };

function countBy(list: AdminUser[] | null, key: (u: AdminUser) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const u of list ?? []) { const k = key(u); out[k] = (out[k] ?? 0) + 1; }
  return out;
}

// ── 🗺 로드맵 ──────────────────────────────────────────────────
function RoadItem({ s, children }: { s: "done" | "wip" | "wait"; children: React.ReactNode }) {
  const m = { done: ["✅", "text-foreground"], wip: ["🔨", "text-amber-600"], wait: ["⏳", "text-foreground-muted"] } as const;
  const [icon, cls] = m[s];
  return <li className="flex gap-2 text-sm"><span aria-hidden="true">{icon}</span><span className={cls}>{children}</span></li>;
}
function Roadmap() {
  return (
    <div className="space-y-4">
      <Card title="완료">
        <ul className="space-y-1.5">
          <RoadItem s="done">공개 도메인 axtaeannews.co.kr 라이브(Cloudflare)</RoadItem>
          <RoadItem s="done">지식그래프 온톨로지 Phase 1~3 — 개체 6종·관계 8종, 소속·축제 자동추출·검수, <strong>검증 사실 AI 답변 근거 통합</strong></RoadItem>
          <RoadItem s="done">예측 인사이트 — 낚시·낙조·제철·해무·미세먼지·개화·위판 시세/추세·산불·영농·양식(조건부)</RoadItem>
          <RoadItem s="done">공개 데이터 지도(/data)·실시간 현황(/live)·인물 탐색(/people)</RoadItem>
          <RoadItem s="done">관광 수요지수 실측 보정(KTO 방문자) · 취재 레이더 → 기자 Web Push 배정</RoadItem>
          <RoadItem s="done">회원 등급 시스템(6계층 Plan 1~4) · 시민기자 신청·<code className="text-xs">/write</code> 투고 에디터</RoadItem>
          <RoadItem s="done">지면 디지털화 1990~2001 · 하이브리드 검색(FTS5+Vectorize RRF)·임베딩 백필</RoadItem>
          <RoadItem s="done">주간 리포트·오디오 나레이션 · 관리자 보고서·대시보드</RoadItem>
        </ul>
      </Card>
      <Card title="진행/검토">
        <ul className="space-y-1.5">
          <RoadItem s="wip">소속·축제 후보 검수 승격(관리자 <code className="text-xs">/admin/kg</code>) — 승인할수록 AI 근거 자동 확대</RoadItem>
          <RoadItem s="wip">온톨로지 Phase 2b 사건·정책 확장 · Phase 3 액션층(취재 배정) 심화</RoadItem>
        </ul>
      </Card>
      <Card title="대기 (사용자 액션 필요)">
        <ul className="space-y-1.5">
          <RoadItem s="wait">양식 수온경보 정식화 — 실시간어장정보 data.go.kr 15058376 활용신청</RoadItem>
          <RoadItem s="wait">인구 추이 — data.go.kr 15108065 활용신청</RoadItem>
          <RoadItem s="wait">해상 데이터(밀물·수온·파고) — KHOA 바다누리 전용키</RoadItem>
          <RoadItem s="wait">오디오 나레이션 커버리지 — Gemini 무료키 추가</RoadItem>
          <RoadItem s="wait">태안신문 기존 회원 연동 — 회원 DB 접근 방식 결정</RoadItem>
        </ul>
      </Card>
      <Card title="후속 정리(minor)">
        <ul className="space-y-1 text-sm text-foreground-muted">
          <li>· 예측 적중률 공개(백테스트 ~5주말 축적 후)</li>
          <li>· 회의록/조례 검색 연동 · 시민기자 반려 후 role 잔존(멱등성) 정리</li>
        </ul>
      </Card>
    </div>
  );
}

// ── 🚀 운영 절차 ──────────────────────────────────────────────
function Runbook() {
  return (
    <div className="space-y-4">
      <Card title="배포">
        <KV
          rows={[
            ["백엔드", code("cd backend && npx wrangler deploy")],
            ["프론트", code("cd web && npm run deploy:cf")],
            ["주의", <span className="text-foreground-muted">반드시 절대경로 cwd. 신규 라우트는 배포 후 ~20초 edge 전파.</span>],
          ]}
        />
      </Card>
      <Card title="D1 마이그레이션">
        <KV
          rows={[
            ["적용", code("cd backend && wrangler d1 execute taean-archive --remote --file ../db/migrations/NNN.sql")],
            ["현재 최신", <>036 (citizen_applications)</>],
          ]}
        />
      </Card>
      <Card title="회원 등급 부여">
        <ul className="space-y-1.5 text-sm">
          <li>· <strong>최종관리자 부트스트랩</strong>(1회): {code("UPDATE users SET role='superadmin',plan='org' WHERE email='…'")} (해당 이메일 /login 가입 선행)</li>
          <li>· 이후 <strong>기자·관리자 임명</strong>=최종관리자만, <strong>시민기자 승인</strong>=관리자 이상 — <code className="text-xs">/admin</code> 👥회원 탭</li>
        </ul>
      </Card>
      <Card title="시크릿·크론">
        <ul className="space-y-1.5 text-sm">
          <li>· 시크릿 갱신: {code("cd backend && npx wrangler secret put <이름>")} — 평문 노출 금지</li>
          <li>· 크론: {code("0 15 * * *")}(자정 KST 뉴스·환경·비용) 외 6개 — {code("backend/src/index.ts")} scheduled()</li>
        </ul>
      </Card>

      <Card title="테스트 · 로컬 개발">
        <KV
          rows={[
            ["백엔드 테스트", code("cd backend && npx vitest run")],
            ["프론트 빌드·테스트", code("cd web && npm run build && npx vitest run")],
            ["로컬 개발", <>{code("wrangler dev")}(백) · {code("npm run dev")}(프론트)</>],
          ]}
        />
      </Card>

      <Card title="장애 대응 · 롤백">
        <ul className="space-y-1.5 text-sm">
          <li>· <strong>롤백</strong>: 배포는 버전이 남으므로 Cloudflare 대시보드/{code("wrangler rollback")}로 직전 버전 복귀</li>
          <li>· <strong>설계상 완충</strong>: 외부 API·웹검색은 fail-open(실패해도 답변 지속), 대량 작업은 체크포인트·지수 백오프 재시도</li>
          <li>· <strong>관리자 비상 접근</strong>: 세션 문제 시 {code("ADMIN_TOKEN")}으로 콘솔 진입(고급 접기)</li>
          <li>· <strong>신규 라우트 404</strong>: 배포 직후 ~20초 edge 전파 지연일 수 있음(재확인)</li>
        </ul>
      </Card>

      <Card title="자주 하는 작업">
        <ul className="space-y-1.5 text-sm">
          <li>· <strong>팩트 시드</strong>(군수·의원 등): {code("tools/kg/*.mjs")} 생성 → {code("wrangler d1 execute … --file")} 적용</li>
          <li>· <strong>회원 등급 변경</strong>: <code className="text-xs">/admin</code> 👥회원 탭(권한 차등 자동 적용)</li>
          <li>· <strong>시민기자 승인</strong>: 👥회원 탭 신청 대기열에서 승인/반려</li>
          <li>· <strong>디지털화</strong>: {code("sh tools/ebook/page.sh <연도>")} → {code("publish.mjs")} → {code("restructure-gemini.mjs")}</li>
        </ul>
      </Card>
    </div>
  );
}

// ── 📦 데이터 현황(라이브) ─────────────────────────────────────
const nn = (v: number | null) => (v === null ? "—" : v.toLocaleString());
const DS_STATUS: Record<string, { label: string; cls: string }> = {
  live: { label: "라이브", cls: "bg-green-100 text-green-800" },
  progress: { label: "진행중", cls: "bg-blue-100 text-blue-800" },
  check: { label: "확인필요", cls: "bg-amber-100 text-amber-800" },
  parked: { label: "보류", cls: "bg-gray-200 text-gray-700" },
  rejected: { label: "미채택", cls: "bg-red-100 text-red-700" },
};

// 데이터 지도 — 예측 소스를 영역(cat)·유형(type)·상태로 분류 표시
const CAT_ORDER = ["관광", "바다", "수산", "농업", "날씨·안전", "지역경제", "기타"];
const CAT_COLOR: Record<string, string> = {
  "관광": "#f97316", "바다": "#0ea5e9", "수산": "#2563eb", "농업": "#16a34a", "날씨·안전": "#f59e0b", "지역경제": "#8b5cf6", "기타": "#94a3b8",
};
const STATUS_DOT: Record<string, string> = { live: "#16a34a", progress: "#d97706", check: "#d97706", parked: "#94a3b8", rejected: "#dc2626" };
function StatTile({ n, label, color }: { n: number; label: string; color?: string }) {
  return (
    <div className="rounded-xl border border-brand/12 bg-background px-3.5 py-2 shadow-sm">
      <p className="text-xl font-extrabold leading-none tabular-nums" style={{ color }}>{n}</p>
      <p className="mt-1 text-[0.68rem] text-foreground-muted">{label}</p>
    </div>
  );
}
function DataMap({ sources }: { sources: NonNullable<ReportSummary["dataSources"]> }) {
  const byCat: Record<string, typeof sources> = {};
  for (const d of sources) { const c = d.cat ?? "기타"; (byCat[c] ??= []).push(d); }
  const live = sources.filter((d) => d.status === "live").length;
  const prog = sources.filter((d) => d.status === "progress").length;
  const off = sources.filter((d) => d.status === "parked" || d.status === "rejected" || d.status === "check").length;
  const typeCounts: Record<string, number> = {};
  for (const d of sources) { const t = d.type ?? "-"; typeCounts[t] = (typeCounts[t] ?? 0) + 1; }
  return (
    <Card title="데이터 지도 — 예측 소스 분류">
      <p className="mb-3 text-xs text-foreground-muted">예측·경보·시세에 쓰는 데이터를 영역·유형·상태로 분류. 전부 무료 공공데이터·큐레이션.</p>
      <div className="mb-1 flex flex-wrap gap-2">
        <StatTile n={sources.length} label="데이터 소스" />
        <StatTile n={live} label="라이브" color="#16a34a" />
        <StatTile n={prog} label="진행중" color="#d97706" />
        <StatTile n={off} label="보류·미채택" color="#94a3b8" />
      </div>
      {CAT_ORDER.filter((cat) => byCat[cat]?.length).map((cat) => (
        <div key={cat} className="mt-5">
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded" style={{ background: CAT_COLOR[cat] }} aria-hidden />
            <span className="text-sm font-bold text-brand">{cat}</span>
            <span className="text-[11px] text-foreground-muted tabular-nums">{byCat[cat].length}</span>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {byCat[cat].map((d) => {
              const st = DS_STATUS[d.status] ?? DS_STATUS.parked;
              return (
                <div key={d.key} className="relative rounded-xl border border-brand/12 bg-background p-3 shadow-sm" style={{ borderLeft: `3px solid ${CAT_COLOR[cat]}` }}>
                  <span className="absolute right-2.5 top-3 h-2 w-2 rounded-full" style={{ background: STATUS_DOT[d.status] ?? "#94a3b8" }} title={st.label} aria-hidden />
                  <div className="flex flex-wrap items-center gap-1.5 pr-4">
                    <span className="text-sm font-bold text-brand">{d.name}</span>
                    {d.type && <span className="rounded-full bg-accent-subtle/50 px-1.5 py-0.5 text-[10px] font-semibold text-brand">{d.type}</span>}
                  </div>
                  {d.note && <p className="mt-1 text-[11px] leading-snug text-foreground-muted">{d.note}</p>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-foreground-muted">
                    {d.granularity && <span>{d.granularity}</span>}
                    {d.metric && <span className="ml-auto font-semibold text-foreground">{d.metric}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="mt-6 rounded-xl border border-brand/10 bg-brand/[0.02] p-3">
        <p className="text-xs font-bold text-brand">유형별</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-foreground-muted">
          {Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).map(([t, n]) => <span key={t}>{t} <b className="text-brand">{n}</b></span>)}
        </div>
      </div>
    </Card>
  );
}

function DataSnapshot() {
  const [s, setS] = useState<ReportSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    getReportSummary().then(setS).catch((e) => setErr(e instanceof Error ? e.message : "불러오기 실패"));
  }, []);
  if (err) return <Card title="데이터 현황"><p className="text-sm text-red-600">{err}</p></Card>;
  if (!s) return <Card title="데이터 현황"><p className="text-sm text-foreground-muted">불러오는 중…</p></Card>;
  const c = s.counts;
  return (
    <div className="space-y-4">
      <Card title="아카이브·콘텐츠">
        <KV
          rows={[
            ["전체 기사", nn(c.articles)],
            ["전자북(디지털화)", <>{nn(c.ebook)} <span className="text-xs text-foreground-muted">(1990~2001)</span></>],
            ["지역언론", nn(c.regionalNews)],
            ["군청 공지·카드", nn(c.govNotices)],
            ["최신 기사", s.freshness.latestArticle?.slice(0, 10) ?? "—"],
          ]}
        />
      </Card>
      <Card title="지식그래프">
        <KV rows={[["인물 노드", nn(c.kgNodes)], ["관계 엣지", nn(c.kgEdges)], ["큐레이션 팩트", nn(c.facts)]]} />
      </Card>
      <Card title="회원·참여">
        <KV
          rows={[
            ["회원", nn(c.users)],
            ["시민기자 신청 대기", nn(c.pendingApplications)],
            ["시민기자 기사", nn(c.citizenArticles)],
            ["등록 기자", nn(c.reporters)],
            ["푸시 구독", nn(c.pushSubs)],
          ]}
        />
      </Card>
      <Card title="자동 생성물">
        <KV
          rows={[
            ["주간 리포트", nn(c.weeklyReports)],
            ["환경 스냅샷(일수)", nn(c.envDays)],
            ["최신 환경 스냅샷", s.freshness.latestEnv?.slice(0, 10) ?? "—"],
          ]}
        />
      </Card>
      {s.dataSources && s.dataSources.length > 0 && <DataMap sources={s.dataSources} />}
      <p className="text-xs text-foreground-muted">기준 {s.generatedAt.slice(0, 16).replace("T", " ")} · 라이브 집계</p>
    </div>
  );
}

// ── 🧾 개발 연혁 ──────────────────────────────────────────────
const CHANGELOG: [string, string][] = [
  ["2026-08-08", "지식그래프 온톨로지 Phase 3 — AI 답변 근거 통합(개체·검증관계로 지어내기 방지), 인물 소속 grounding·개체 사실 인용"],
  ["2026-08-08", "온톨로지 액션층·후속 — 취재 레이더(개체별 보도공백)+기자 Web Push 배정, /people 관계망 조직 노드, 승격 축제 주관·개최지 자동연결"],
  ["2026-08-08", "온톨로지 Phase 2·2b — 조직·사건·정책 개체 + 소속·주관·추진·개최지 관계, 소속 2,394·축제 169 자동추출·검수 콘솔(승격 201)"],
  ["2026-08-07", "온톨로지 Phase 1(장소·품목·취급) + 공개 데이터 지도(/data)·지식그래프 섹션 — 데이터 소스·온톨로지 투명 공개"],
  ["2026-08-07", "관리자 대시보드·보고서 역할 정리(숫자=대시보드/문서=보고서)·데이터 지도 카드, 양식 수온경보(임시)"],
  ["2026-08-06", "예측 인사이트 대량 확장 — 낚시 출조·낙조·제철 수산물·해무·미세먼지·개화(꽃·단풍)·위판 물량값 추세·산불위험·영농경보"],
  ["2026-08-06", "커스텀 도메인 axtaeannews.co.kr 라이브(Cloudflare, 가가도메인 연결)"],
  ["2026-08-05", "수산물 소매 시세(KAMIS)·위판장 경매가(산지 경락가)·기상특보 급감신호·시민기자 공개모집(QR 랜딩)"],
  ["2026-08-04", "관광 수요지수 실측 재보정(KTO 방문자 3년) + 산업 다부문(농산물 도매·갯벌 물때·교통량 선행지표·해수욕장별)"],
  ["2026-08-03", "인물 탐색 품질 대개선 — 위키백과 요약·전국인물 억제·시제 정정·공식 사진·조회 속도, 회원 관리(수정·삭제·기자계정 생성)"],
  ["2026-08-02", "/live·주간리포트 정보밀도 개선(카드 통합)·부동산 실거래 요약, 오너 준비 알림 푸시(07:00)·예보 적중률 증명"],
  ["2026-08-01", "독자용 공개 인물 탐색(/people) — AI 전기·관계망(mesh)·한자 정제, 비로그인 첫화면 강화, 주간 팟캐스트 다시듣기"],
  ["2026-07-31", "관리자 보고서 허브(/admin/report) — 개요·AI기술·운영·로드맵·절차·데이터·이력·상태 8탭"],
  ["2026-07-31", "회원 등급 시스템 Plan 1~4 완결 — 접근제어·프런트 계층·회원관리·시민기자 신청·/write 통합 에디터"],
  ["2026-07-30", "역대 군수 공식본+사진(인물카드), 현직 군의원 프로필(선거구·연락처)"],
  ["2026-07-30", "경량 그래프 오케스트레이션(runGraph) 기본 승격, 답변 자동 차트·근거 단락화·PDF"],
  ["2026-07-27", "지식그래프 인물 탐색·관계 라벨링(6종), 동명이인 병합 검수 콘솔"],
  ["2026-07-26", "전 코퍼스 인물·공동등장 그래프 추출(인물 3.4만·엣지 127만)"],
  ["2026-07-22", "웹 보강 RAG 네이버 검색, 붕괴·외국문자 방지 게이트"],
  ["2026-07-18", "하이브리드 검색(키워드 FTS5 + Vectorize 의미) RRF 병합·아카이브 임베딩 백필 ~59k"],
  ["2026-07-02", "카카오 로그인(OAuth), 회원 계정·세션 체계"],
  ["2026-06-22", "실시간 현황 페이지(/live)·환경 자동 알림(대기질·자외선·파고 임계 07시)·Web Push 실발송(RFC8291)·이메일 뉴스레터 토대·metrics 사전계산 캐시(콜드 9s→0.7s)"],
  ["2026-06-21", "생활지표 확장 — 서핑지수·자외선지수·충남 주유 평균가, 리포트 발행 Web Push 알림"],
  ["2026-06-20", "주간리포트 시각화 + 관광 수요지수 v1(규칙기반)·해변 바다정보(수온·파고·물때·해수욕지수)·일출일몰·제철 먹거리·'이번 주 한눈에' 인포그래픽"],
  ["2026-06-19", "지면 디지털화 1990~2001 완료(Google Vision OCR + Gemini 기사 재구조화)·띄어쓰기 이식·관리자 검수·독자 원본지면 뷰어"],
  ["2026-06-18", "주간 인사이트 리포트 MVP — Workers AI 5섹션 초안(금 16시 cron) → 편집부 검토(HITL) 발행 → /reports·PDF, 군청 군정 게시판 수집"],
  ["2026-06-16", "AI 질의 RAG — 아카이브 근거 + 날씨·대기질 실시간 통합·출처 표기(순수 날씨 질문은 실측만)"],
  ["2026-06-15", "뉴스 자동수집(RSS+기사목록 병합·회원로그인 전문수집) + 외부 커넥터(날씨·대기질·관광 TourAPI)"],
  ["2026-06-07", "태안신문 아카이브 구축 — 전문 백필(회원세션)·D1(텍스트+FTS 검색)+R2(사진), 시민기자 Co-Pilot MVP"],
  ["2026-05-27", "플랫폼 부트스트랩 — Cloudflare Workers+OpenNext 배포, 백엔드(비용 가드·하이브리드 LLM·AI 거버넌스), 경량 그래프 라우터, 초개인화(/me·온보딩·Web Push)"],
];
function Changelog() {
  return (
    <Card title="개발 연혁">
      <ol className="space-y-2 text-sm">
        {CHANGELOG.map(([d, t], i) => (
          <li key={i} className="flex gap-3">
            <span className="shrink-0 font-mono text-xs text-foreground-muted">{d}</span>
            <span>{t}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-foreground-muted">전체 기능 로그는 RUNBOOK.md §5.</p>
    </Card>
  );
}

// ── ⚙️ 자동화(자동작업 현황) — 대시보드에서 이동(운영 현황 문서화) ──
const JOB_ICON: Record<string, string> = { ok: "✅", warn: "⚠️", idle: "⏸" };
function ago(iso: string | null): string {
  if (!iso) return "기록 없음";
  const t = Date.parse(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (!Number.isFinite(t)) return iso;
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 60) return `${m}분 전`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}시간 전`;
  return `${Math.round(h / 24)}일 전`;
}
function JobsSection() {
  const [d, setD] = useState<{ jobs: JobStatus[]; generatedAt: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => getJobs().then(setD).catch((e) => setErr(e instanceof Error ? e.message : "불러오기 실패"));
  useEffect(() => { void load(); }, []);
  if (err) return <p className="text-sm text-red-600">{err}</p>;
  if (!d) return <p className="text-sm text-foreground-muted">불러오는 중…</p>;
  const warns = d.jobs.filter((j) => j.status === "warn").length;
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-brand">⚙️ 자동작업 현황</h2>
        <div className="flex items-center gap-3 text-xs text-foreground-muted">
          {warns > 0 ? <span className="font-semibold text-amber-700">⚠️ 지연 {warns}건</span> : <span className="text-green-700">✅ 전체 정상</span>}
          <button type="button" onClick={load} className="rounded border border-brand/20 px-2.5 py-1 font-semibold text-brand hover:bg-brand/5">새로고침</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-brand/15 text-left text-xs text-foreground-muted">
            <th className="py-2 pr-2">상태</th><th className="py-2 pr-3">작업</th><th className="py-2 pr-3">소스·실행 위치</th><th className="py-2 pr-3">주기</th><th className="py-2 pr-3">최근 데이터</th><th className="py-2">최근 결과</th>
          </tr></thead>
          <tbody>
            {d.jobs.map((j) => (
              <tr key={j.key} className={`border-b border-brand/5 ${j.status === "warn" ? "bg-amber-50/60" : ""}`}>
                <td className="py-2 pr-2">{JOB_ICON[j.status]}</td>
                <td className="py-2 pr-3 font-medium text-brand">{j.name}</td>
                <td className="py-2 pr-3 text-xs text-foreground-muted">{j.source}</td>
                <td className="py-2 pr-3 text-xs">{j.schedule}</td>
                <td className="py-2 pr-3 text-xs" title={j.lastRun ?? ""}>{ago(j.lastRun)}</td>
                <td className="py-2 text-xs">{j.result}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-foreground-muted">
        기준 {new Date(d.generatedAt).toLocaleString("ko-KR")} · &quot;최근 데이터&quot;는 실제 적재된 데이터의 시각 기준
        (신규가 없으면 오래돼 보일 수 있음 — ⚠️는 주기×2 초과 시 표시) · VPS 작업은 카페24 서버에서 실행
      </p>
    </section>
  );
}
