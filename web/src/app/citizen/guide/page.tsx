import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";

// 시민기자 자습 안내 — 로그인 없이 읽는 7단계. 2026-10 오프라인 교육(2회)의 교재이자 집에서 따라 하는 자료.
//   · 참가자 5명 중 3명이 60대 이상 — 한 단계에 한 동작, 누를 곳은 굵게, 화면 그림은 실제 화면 구조 그대로.
//   · 화면 그림은 HTML로 그린다(캡처가 아니라서 화면이 바뀌어도 낡지 않고, 글자가 선명하게 인쇄된다).
//   · 인쇄하면 상단바·푸터가 빠지고(globals.css @media print) 단계마다 잘리지 않는다(break-inside-avoid).
//   · 여기 적힌 기능은 /write 에디터(components/write/copilot-editor.tsx)에 **실제로 있는 것만** — 없는 기능을 적지 않는다.

export const metadata: Metadata = {
  title: "시민기자 시작 안내",
  description: "태안신문 시민기자가 회원가입부터 첫 기사 제출까지 따라 하는 7단계 안내",
};

const PHONE = "041-673-7762";

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`step-${n}`} className="break-inside-avoid rounded-2xl border border-brand/15 bg-background p-5 sm:p-7 space-y-4">
      <h2 id={`step-${n}`} className="flex items-center gap-3 break-keep text-2xl font-bold text-brand">
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-lg text-background">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Do({ children }: { children: ReactNode }) {
  // '누르세요' 문장 — 동작만 굵게
  return <p className="text-[1.05rem] leading-relaxed text-foreground">{children}</p>;
}

function Note({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-accent-subtle/30 px-3 py-2 text-[0.95rem] leading-relaxed text-foreground-muted">{children}</p>;
}

function Press({ children }: { children: ReactNode }) {
  // 화면의 버튼·메뉴 이름을 본문에서 가리킬 때
  return <strong className="rounded border border-brand/30 bg-brand/5 px-1.5 py-0.5 text-brand">{children}</strong>;
}

function Screen({ title, children, caption }: { title: string; children: ReactNode; caption?: string }) {
  // 화면 그림 — 실제 화면의 배치를 단순하게 옮긴 것. 색·간격은 실제와 비슷하게, 글자는 크게.
  return (
    <figure className="break-inside-avoid space-y-2">
      <div className="overflow-hidden rounded-xl border-2 border-brand/20 bg-white text-sm shadow-sm" role="img" aria-label={`화면 그림: ${title}`}>
        <div className="flex items-center gap-1.5 border-b border-brand/10 bg-brand/5 px-3 py-1.5 text-xs text-foreground-muted">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-brand/20" />
          <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-brand/20" />
          <span className="ml-2 truncate">{title}</span>
        </div>
        <div className="p-4">{children}</div>
      </div>
      {caption && <figcaption className="text-sm text-foreground-muted">{caption}</figcaption>}
    </figure>
  );
}

function Btn({ children, accent = false, wide = false }: { children: ReactNode; accent?: boolean; wide?: boolean }) {
  return (
    <span className={`${wide ? "flex w-full" : "inline-flex"} items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold ${accent ? "bg-accent text-white" : "border border-brand/30 bg-white text-brand"}`}>
      {children}
    </span>
  );
}

function Field({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-brand/20 bg-white px-3 py-2 text-foreground-muted">
      {label}
      {hint && <span className="ml-2 text-xs">{hint}</span>}
    </div>
  );
}

function Callout({ n }: { n: number }) {
  return <span aria-hidden className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[0.7rem] font-bold text-white">{n}</span>;
}

export default function CitizenGuidePage() {
  return (
    <div className="mx-auto max-w-[840px] space-y-8 break-keep">
      <PageHeader
        eyebrow="태안신문 시민기자단 2026"
        title="시민기자 시작 안내"
        description="회원가입부터 첫 기사 제출까지 7단계. 교육 때 같이 하고, 집에서는 이 페이지를 보며 따라 하세요."
      />

      <div className="no-print flex flex-wrap gap-2">
        <Link href="/login?mode=signup" className="btn-accent">1단계 · 회원가입하러 가기</Link>
        <Link href="/me" className="rounded-lg border border-brand/30 px-4 py-2 font-semibold text-brand hover:bg-brand/5">2단계 · 내 페이지</Link>
        <Link href="/write" className="rounded-lg border border-brand/30 px-4 py-2 font-semibold text-brand hover:bg-brand/5">4단계 · 에디터 열기</Link>
      </div>

      <section aria-label="활동 규칙 요약" className="break-inside-avoid grid gap-3 rounded-2xl bg-brand/5 p-5 text-[1.02rem] md:grid-cols-2">
        <p><strong className="text-brand">활동 기간</strong> — 2026년 10월 ~ 11월</p>
        <p><strong className="text-brand">쓰는 양</strong> — 1인당 총 4편</p>
        <p><strong className="text-brand">원고료</strong> — 편당 5만원, 매월 말 정산</p>
        <p><strong className="text-brand">막히면</strong> — 태안신문 편집국 ☎ {PHONE}</p>
      </section>

      <Step n={1} title="회원가입 — 계정 만들기">
        <Do>아래 <Press>회원가입하러 가기</Press>를 누르면 가입 화면이 열립니다. 두 가지 중 편한 쪽으로 하세요.</Do>
        <ul className="list-disc space-y-1 pl-6 text-[1.02rem] leading-relaxed">
          <li><strong>카카오로 시작하기</strong> — 카카오톡을 쓰신다면 이게 제일 쉽습니다. 누르고 카카오 화면에서 <Press>동의하고 계속</Press>.</li>
          <li><strong>이메일로 가입</strong> — 이메일 주소와 비밀번호(8자 이상)를 적고 <Press>회원가입</Press>. 이름은 안 적어도 됩니다.</li>
        </ul>
        <Screen title="axtaeannews.co.kr/login" caption="가입 화면. 카카오 버튼이 위에, 이메일 칸이 아래에 있습니다.">
          <div className="mx-auto max-w-xs space-y-2">
            <p className="text-lg font-bold text-brand">회원가입</p>
            <Btn wide>💬 카카오로 시작하기</Btn>
            <p className="text-center text-xs text-foreground-muted">또는 이메일</p>
            <Field label="이름(선택)" />
            <Field label="이메일" />
            <Field label="비밀번호(8자 이상)" />
            <Btn accent wide>회원가입</Btn>
            <p className="text-center text-xs text-foreground-muted">이미 계정이 있으신가요? <span className="text-accent">로그인</span></p>
          </div>
        </Screen>
        <Note>비밀번호는 수첩에 적어 두세요. 잊으면 편집국(☎ {PHONE})에 전화 주시면 도와드립니다.</Note>
        <div className="no-print"><Link href="/login?mode=signup" className="btn-accent">회원가입하러 가기</Link></div>
      </Step>

      <Step n={2} title="시민기자 신청 — 내 페이지에서 한 번">
        <Do>로그인하면 <strong>내 페이지</strong>가 열립니다. 아래로 내리면 <Press>🖊 시민기자 신청</Press> 칸이 있습니다. 사유는 안 적어도 되고, <Press>시민기자 신청</Press>을 누르면 끝입니다.</Do>
        <Screen title="axtaeannews.co.kr/me" caption="내 페이지의 신청 칸. 한 번만 누르면 됩니다.">
          <div className="max-w-md space-y-2 rounded-lg border border-brand/15 p-3">
            <p className="font-semibold text-brand">🖊 시민기자 신청</p>
            <p className="text-xs text-foreground-muted">태안 소식을 직접 취재·투고하고 싶으신가요? 신청하면 관리자 승인 후 글쓰기가 열립니다.</p>
            <Field label="신청 사유(선택)" />
            <Btn accent>시민기자 신청</Btn>
          </div>
        </Screen>
        <Note>누르고 나면 같은 자리에 <strong>“신청 상태: 대기 — 관리자 승인을 기다리는 중입니다”</strong>라고 뜹니다. 정상입니다.</Note>
      </Step>

      <Step n={3} title="승인 기다리기 — 교육 날에는 그 자리에서">
        <Do>편집국이 승인하면 글쓰기가 열립니다. <strong>교육 날에는 신청하는 자리에서 바로 승인</strong>해 드리니 기다릴 일이 없습니다. 집에서 신청했다면 하루 안에 승인됩니다.</Do>
        <Note>승인되면 화면 위쪽 메뉴에 <Press>시민기자</Press>가 새로 생깁니다. 안 보이면 화면을 한 번 새로고침하세요. 그래도 “시민기자만 이용할 수 있습니다”가 보이면 승인 전이니 편집국에 전화 주세요.</Note>
      </Step>

      <Step n={4} title="에디터 열기 — 화면 한 번 익히기">
        <Do>위쪽 메뉴 <Press>시민기자</Press>를 누르고 <Press>시민기자 에디터 열기</Press>를 누릅니다. 주소창에 <strong>axtaeannews.co.kr/write</strong>를 쳐도 됩니다. 화면은 이렇게 생겼습니다.</Do>
        <Screen title="axtaeannews.co.kr/write — 시민기자 에디터" caption="① 제목 ② 본문 ③ 사진 추가 ④ AI 사용 정도와 출처 ⑤ 제출. 오른쪽은 도와주는 칸입니다.">
          <div className="space-y-3">
            <div className="rounded-lg border border-accent/40 bg-accent-subtle/20 p-2">
              <p className="text-xs font-bold text-brand">키워드로 초안 생성</p>
              <div className="mt-1 flex gap-2"><div className="flex-1"><Field label="예: 만리포 해수욕장 개장, 피서객, 주차 대책" /></div><Btn accent>초안 생성</Btn></div>
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_190px]">
              <div className="space-y-2">
                <Field label="① 기사 제목" />
                <div className="h-24 rounded-lg border border-brand/20 bg-white px-3 py-2 text-foreground-muted">② 본문을 입력하세요. 작성하는 동안 개인정보·민감주제를 실시간으로 확인합니다.</div>
                <Btn>🖼 ③ 사진 추가</Btn>
                <div className="rounded-lg border border-brand/15 p-2 text-xs">
                  <p className="font-semibold text-brand">④ AI 사용 정도 (라벨)</p>
                  <p className="mt-1 flex flex-wrap gap-1"><Btn>사람 작성</Btn><Btn>AI 보조</Btn><Btn>AI 생성</Btn></p>
                  <p className="mt-2 font-semibold text-brand">출처 (AI 보조·생성 시 필수)</p>
                  <Field label="예: 태안군 보도자료 / 현장 취재" />
                </div>
                <Btn accent wide>⑤ 편집부에 제출</Btn>
              </div>
              <div className="space-y-2 text-xs">
                <div className="rounded-lg border border-brand/15 p-2"><p className="font-bold text-brand">실시간 점검</p><p className="text-foreground-muted">✅ 감지된 위험 없음</p></div>
                <div className="rounded-lg border border-brand/15 p-2"><p className="font-bold text-brand">AI 글쓰기 보조</p><p className="mt-1 flex flex-wrap gap-1"><Btn>다듬기</Btn><Btn>요약</Btn><Btn>제목 추천</Btn><Btn>사실 점검</Btn></p></div>
                <div className="rounded-lg border border-brand/15 p-2"><p className="font-bold text-brand">관련 과거 보도</p><p className="text-foreground-muted">제목·본문과 관련된 태안신문 옛 기사</p></div>
              </div>
            </div>
          </div>
        </Screen>
        <Note>글자가 작게 보이면 손가락 두 개로 벌리거나(폰), <strong>Ctrl</strong>과 <strong>+</strong>를 함께 누르세요(컴퓨터).</Note>
      </Step>

      <Step n={5} title="글쓰기 — 제목과 본문, 그리고 AI 도움">
        <Do><Callout n={1} /><strong>제목</strong>을 적고 <Callout n={2} /><strong>본문</strong>을 씁니다. 쓰는 동안 오른쪽 <strong>실시간 점검</strong>이 개인 전화번호·주소 같은 개인정보나 민감한 주제가 들어가면 알려 줍니다.</Do>
        <p className="text-[1.02rem] font-semibold text-brand">AI가 도와주는 것 — 필요할 때만</p>
        <ul className="list-disc space-y-1.5 pl-6 text-[1.02rem] leading-relaxed">
          <li><strong>다듬기</strong> — 쓴 문장을 자연스럽게 고쳐 보여 줍니다. 마음에 들면 <Press>본문에 반영</Press>.</li>
          <li><strong>요약</strong> — 긴 글의 핵심 3줄. 리드(첫 문단) 쓸 때 참고.</li>
          <li><strong>제목 추천</strong> — 본문을 읽고 제목 후보를 냅니다.</li>
          <li><strong>사실 점검</strong> — 본문에서 확인해야 할 숫자·이름·날짜를 뽑아 줍니다. <strong>맞는지는 직접 확인</strong>하세요.</li>
          <li><strong>관련 과거 보도</strong> — 같은 주제의 태안신문 옛 기사. 배경을 넣거나 “2019년에도 … 했다”처럼 쓸 때.</li>
          <li><strong>키워드로 초안 생성</strong> — 낱말 몇 개로 뼈대를 만듭니다. 만든 글은 <strong>반드시 읽고 고치고</strong>, 라벨을 <strong>AI 생성</strong>으로 둡니다.</li>
        </ul>
        <Note>AI는 태안의 일을 모릅니다. 사람 이름·숫자·날짜는 AI가 아니라 <strong>내가 확인한 것</strong>만 씁니다. 그게 시민기자의 일입니다.</Note>
      </Step>

      <Step n={6} title="사진·출처·AI 라벨 — 세 가지 채우기">
        <ul className="list-disc space-y-1.5 pl-6 text-[1.02rem] leading-relaxed">
          <li><Callout n={3} /><strong>사진 추가</strong> — 폰에서 찍은 사진을 고릅니다. 사진 속 사람에게는 “신문에 실려도 될까요?” 한마디 묻고 찍으세요.</li>
          <li><Callout n={4} /><strong>AI 사용 정도</strong> — 셋 중 하나를 고릅니다. <strong>사람 작성</strong>(AI 안 씀) · <strong>AI 보조</strong>(다듬기·요약 등을 씀) · <strong>AI 생성</strong>(초안 생성으로 시작).</li>
          <li><strong>출처</strong> — 어디서 알게 된 내용인지. “현장 취재”, “태안군 보도자료”, “○○ 이장 인터뷰”처럼. <strong>AI를 썼으면 반드시</strong> 적어야 제출됩니다.</li>
        </ul>
      </Step>

      <Step n={7} title="저장하고 제출 — 편집부가 읽고 싣습니다">
        <Do>중간에 <Press>초안 저장</Press>을 누르면 서버에 남습니다(누르지 않아도 이 기기에는 자동 저장됩니다). 다 쓰면 <Press>미리보기</Press>로 한 번 읽고, 제출 전 점검 7가지에 표시한 뒤 <Callout n={5} /><Press>편집부에 제출</Press>.</Do>
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            ["제출", "편집부에 도착"],
            ["검토", "편집부가 읽고, 고칠 곳이 있으면 연락"],
            ["게재", "태안신문 사이트와 아카이브에 내 이름으로"],
          ].map(([t, d], i) => (
            <div key={t} className="rounded-lg border border-brand/15 p-3">
              <p className="font-bold text-brand">{i + 1}. {t}</p>
              <p className="text-sm text-foreground-muted">{d}</p>
            </div>
          ))}
        </div>
        <Note>제출한 뒤에는 고칠 수 없습니다. 고칠 것이 생기면 편집국에 말씀해 주세요. 원고료는 게재된 기사를 세어 <strong>매월 말</strong> 정산합니다.</Note>
      </Step>

      <section aria-labelledby="stuck" className="break-inside-avoid space-y-3 rounded-2xl border border-brand/15 p-5 sm:p-7">
        <h2 id="stuck" className="text-2xl font-bold text-brand">여기서 막히면</h2>
        <dl className="space-y-3 text-[1.02rem] leading-relaxed">
          {[
            ["비밀번호를 잊었어요", `편집국(☎ ${PHONE})에 전화 주세요. 카카오로 가입했다면 비밀번호가 없습니다 — 카카오로 시작하기를 다시 누르면 됩니다.`],
            ["‘시민기자만 이용할 수 있습니다’라고 나와요", "아직 승인 전입니다. 2단계 신청을 했는지 내 페이지에서 확인하고, 했다면 편집국에 전화 주세요."],
            ["쓰던 글이 사라졌어요", "같은 기기·같은 브라우저에서 에디터를 다시 열면 자동 저장된 글이 돌아옵니다. 초안 저장을 눌렀다면 에디터 위의 ‘내 기사’에서 찾을 수 있습니다."],
            ["사진이 안 올라가요", "너무 큰 사진(수십 MB)은 안 올라갑니다. 폰에서 ‘작게 보내기’로 줄이거나, 한 장씩 올려 보세요."],
            ["제출 버튼이 눌리지 않아요", "AI를 썼는데 출처를 비워 두면 눌리지 않습니다. 출처 칸을 채우세요. 제목이나 본문이 비어도 마찬가지입니다."],
            ["카카오 로그인이 안 돼요", "카카오톡 앱이 최신인지 확인하고 다시 시도하세요. 계속 안 되면 이메일로 가입해도 됩니다."],
          ].map(([q, a]) => (
            <div key={q} className="break-inside-avoid">
              <dt className="font-semibold text-brand">Q. {q}</dt>
              <dd className="text-foreground-muted">{a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="tips" className="break-inside-avoid space-y-3 rounded-2xl bg-brand/5 p-5 sm:p-7">
        <h2 id="tips" className="text-2xl font-bold text-brand">기사 한 편을 쓸 때 — 다섯 가지만</h2>
        <ol className="list-decimal space-y-1.5 pl-6 text-[1.02rem] leading-relaxed">
          <li><strong>첫 문단에 다 담기</strong> — 누가·언제·어디서·무엇을·왜. 바쁜 독자는 첫 문단만 읽습니다.</li>
          <li><strong>본 것과 들은 것을 나누기</strong> — 내가 본 것은 그대로, 남에게 들은 것은 “○○씨는 …라고 말했다”.</li>
          <li><strong>숫자·이름·날짜는 두 번 확인</strong> — 현수막, 안내문, 담당자에게. AI에게 묻지 않습니다.</li>
          <li><strong>사진은 사람이 있게</strong> — 행사 사진은 무대보다 참가자 얼굴이 살아 있습니다. 찍기 전에 한마디 양해.</li>
          <li><strong>개인정보는 빼기</strong> — 전화번호·집 주소·차 번호는 싣지 않습니다. 실시간 점검이 잡아 주지만 내가 먼저.</li>
        </ol>
      </section>

      <p className="pb-6 text-center text-sm text-foreground-muted">
        태안신문사 편집국 ☎ {PHONE} · 이 안내는 인쇄해서 곁에 두셔도 됩니다.
      </p>
    </div>
  );
}
