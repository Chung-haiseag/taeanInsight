// AI 코파일럿 — 이어지는 질문과 '보고 있는 화면'을 다루는 순수 규칙.
//
//   왜: 질의응답이 죽어 있었다(2026-08-03 이후 0건). 원인은 답의 품질이 아니라 **형태**였다 —
//     로그인해야 메뉴가 보이고, 빈 칸에 질문을 지어내야 하고, 보던 것을 떠나야 했다.
//     화면 옆에 붙어 "이 목록에서 가장 많이 나온 사람은?" 같이 물을 수 있으면 질문이 저절로 생긴다.
//
//   설계: RAG 파이프라인은 **손대지 않는다.** 이어지는 질문을 '혼자 서는 질문'으로 되살린 뒤
//     기존 경로에 그대로 넘긴다(질의 재작성). 검색·근거·교열이 이미 잘 도는데 거기에
//     대화 상태를 밀어 넣으면 회귀 위험만 커진다.
//
//   ⚠ 되살리기는 **필요할 때만** 한다. 혼자 서는 질문까지 손대면 원 질문이 망가지고
//     LLM 호출도 한 번 더 늘어난다.

/** 대화 한 마디. */
export interface Turn { role: "user" | "assistant"; text: string }

/** 앞말을 받아야 뜻이 서는 지시어. '이 화면·여기'처럼 보고 있는 것을 가리키는 말도 포함한다. */
const DEICTIC = /(^|\s)(그|이|저|요|거기|여기|얘|걔|쟤)(\s|것|거|건|걸|게|런|런것|사람|분|때|곳|쪽|화면|목록|기사|광고|글|내용|얘기|말)/;
/** 앞말 없이는 아무 뜻이 없는 되묻기. */
const FOLLOWUP = /^(왜|어떻게|언제|누가|어디|얼마|더|또|그래서|그럼|그러면|자세히|계속)\b|^.{0,6}(왜|어때|어떄|맞아|맞나|인가요?)\s*[?？]?$/;

/** 이 질문이 앞말(이력·화면)을 받아야 하는가(순수). */
export function needsRewrite(query: string): boolean {
  const q = (query ?? "").trim();
  if (!q) return false;
  if (FOLLOWUP.test(q)) return true;
  if (DEICTIC.test(q)) return true;
  // 아주 짧고 서술어가 없으면 되묻기로 본다('더 알려줘').
  return q.length <= 8 && !/[가-힣]{2,}\s+[가-힣]{2,}/.test(q);
}

/** 주소 → 사람 말로 된 화면 설명(순수). 모르면 null — 지어내지 않는다. */
export function describePath(path: string | null | undefined): string | null {
  const raw = (path ?? "").trim();
  if (!raw) return null;                       // 주소를 모르는 것과 '첫 화면'은 다르다
  const p = raw.replace(/[?#].*$/, "").replace(/\/+$/, "") || "/";
  const exact: Record<string, string> = {
    "/": "첫 화면",
    "/news": "뉴스 아카이브 검색",
    "/people": "인물 검색",
    "/live": "지금 태안(실시간 지표)",
    "/beaches": "해변 정보",
    "/data": "지역경제 데이터",
    "/reports": "주간 인사이트 리포트",
    "/membership": "멤버십 안내",
    "/paper": "옛 지면 넘겨보기",
    "/paper/ads": "옛 지면 광고 목록",
    "/paper/prices": "옛날 물가표(광고에서 뽑은 30년 시세)",
  };
  if (exact[p]) return exact[p];
  const article = p.match(/^\/news\/(\d+)$/);
  if (article) return `기사 상세(번호 ${article[1]})`;
  const year = p.match(/^\/paper\/(\d{4})$/);
  if (year) return `${year[1]}년 지면 목록`;
  const issue = p.match(/^\/paper\/(\d{4})\/(\d{4}-\d{2}-\d{2})/);
  if (issue) return `${issue[2]} 지면`;
  return null;
}

const MAX_TURNS = 6;
const MAX_TURN_CHARS = 300;

/** 이력을 최근 것 위주로 줄인다 — 프롬프트가 근거 자리를 잡아먹지 않게. */
export function trimHistory(history: Turn[] | null | undefined): Turn[] {
  const h = Array.isArray(history) ? history : [];
  return h.slice(-MAX_TURNS).map((t) => ({ role: t.role, text: String(t.text ?? "").slice(0, MAX_TURN_CHARS) }));
}

/**
 * LLM 없이 되살린 질문(순수) — 되살리기 LLM 호출이 실패했을 때의 대비책.
 *   직전 사용자 질문이나 화면 설명을 앞에 붙여 검색어가 최소한 뜻을 갖게 한다.
 */
export function standaloneFallback(query: string, history: Turn[], screen: string | null): string {
  const lastUser = [...(history ?? [])].reverse().find((t) => t.role === "user")?.text;
  if (lastUser) return `${lastUser} ${query}`;
  if (screen) return `${screen}에 대해: ${query}`;
  return query;
}
