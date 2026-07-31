"use client";

// 관리자 "보고서" — 운영 핸드북. 프로젝트 개요 + 운영 정보(접속주소·서버설정·내부 설정값·회원현황).
//   탭 배열에 항목만 추가하면 확장. 세션 admin 게이트(비밀값은 표시하지 않음 — 이름·설정 여부만).

import { useEffect, useState } from "react";
import Link from "next/link";

import { getSession, type Account } from "@/lib/api/auth";
import { hasRole } from "@/lib/roles";
import { getUsers, type AdminUser } from "@/lib/api/admin";

type ReportTab = "overview" | "tech" | "ops";
const TABS: { key: ReportTab; label: string }[] = [
  { key: "overview", label: "프로젝트 개요" },
  { key: "tech", label: "🧠 AI·기술" },
  { key: "ops", label: "운영 정보" },
  // 이후 확장: { key: "cost", label: "비용·성과" }, { key: "changelog", label: "변경 이력" } 등
];

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

      {tab === "overview" ? <ProjectOverview /> : tab === "tech" ? <TechOverview /> : <OperationsInfo />}
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
          <li>🔎 <strong>AI 질의응답</strong> — 아카이브 RAG(FTS5+의미검색) + 실시간 근거(날씨·대기질·관광)로 출처 표기</li>
          <li>📰 <strong>뉴스 아카이브</strong> — 자사·지역언론 수집, 전문 검색, 인물 지식그래프</li>
          <li>🖨 <strong>지면 디지털화</strong> — 1990~2001 옛 지면 OCR→기사화(Google Vision + Gemini)</li>
          <li>👥 <strong>회원 등급 시스템</strong> — 비로그인·회원·시민기자·기자·관리자·최종관리자 6계층</li>
          <li>🖊 <strong>시민기자 투고</strong> — 신청·승인 후 <code className="text-xs">/write</code>에서 AI 보조 작성→검수 큐</li>
          <li>📅 <strong>주간 리포트·오디오</strong> — 자동 생성 리포트 + 나레이션(Gemini)</li>
          <li>🔔 <strong>취재 알림</strong> — 군청공지·특보·데이터 급변·키워드 트리거 Web Push</li>
        </ul>
      </Card>

      <Card title="현황(2026-07)">
        <ul className="space-y-1 text-sm text-foreground-muted">
          <li>· 회원 등급·접근 계층 시스템(Plan 1~4) 완결·라이브.</li>
          <li>· 지면 디지털화 1990~2001 전량 라이브.</li>
          <li>· 최종관리자 부트스트랩 완료(소유자 1인).</li>
          <li>· 검토 중: 도메인 이전(tamemory.com, 보류).</li>
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
  ["verified", "사람이 검수해 사실로 확정한 데이터. 답변에는 verified만 신뢰해 주입한다."],
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

      <Card title="② 지식그래프 증강 (GraphRAG 접근)">
        <ul className="space-y-1.5 text-sm">
          <li>· <strong>구축</strong>: 전 코퍼스 기사에서 인물 NER(Gemini Flash-Lite)→본문충실 필터→{code("kg_nodes")}(인물 ~3.4만)·{code("kg_mentions")}, 공유쌍 집계로 <strong>공동등장 엣지 ~127만</strong></li>
          <li>· <strong>관계 라벨</strong>: 협력·동료 / 대립·갈등 / 소속·상하 / 전임·후임 / 가족·인척 / 기타 6종(Gemini, 제목 근거 불명확은 보수적 기타)</li>
          <li>· <strong>정제</strong>: 동명이인 병합(canonical·맥락 겹침 검수), 초허브(기자 바이라인) 제외로 노이즈 억제</li>
          <li>· <strong>답변 주입</strong>: 질의에 인물이 감지되면 그래프 기반 <strong>인물 브리핑</strong> + <strong>관계 근거</strong>를 결합. 자동추출분은 미검증(verified=0)이라 관리자 <code className="text-xs">/admin/kg</code> 탐색·검수용으로 구분</li>
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
const APP_URL = "https://taean-insight.chs9182.workers.dev";
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
      <Card title="접속 주소">
        <KV
          rows={[
            ["공개 앱", <a href={APP_URL} target="_blank" rel="noopener noreferrer" className="text-accent underline">{APP_URL}</a>],
            ["백엔드 API", <a href={API_URL} target="_blank" rel="noopener noreferrer" className="text-accent underline">{API_URL}</a>],
            ["관리자 콘솔", <>{code("/admin")} · {code("/admin/kg")} · {code("/admin/report")}</>],
            ["운영 도메인", <span className="text-foreground-muted">insight.taeannews.co.kr (미연결) · tamemory.com 이전 검토 중</span>],
          ]}
        />
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

const ROLE_LABEL: Record<string, string> = { user: "일반", citizen: "시민기자", reporter: "기자", admin: "관리자", superadmin: "최종관리자" };
const PLAN_LABEL: Record<string, string> = { free: "무료", reader: "독자", business: "비즈니스", org: "기관" };

function countBy(list: AdminUser[] | null, key: (u: AdminUser) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const u of list ?? []) { const k = key(u); out[k] = (out[k] ?? 0) + 1; }
  return out;
}
