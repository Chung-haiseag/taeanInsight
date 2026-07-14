// TTS 낭독용 텍스트 전처리 — 엔티티 디코딩·특수문자 정규화·문장 청킹.
// 순수 함수만 모아 단위 테스트(tests/audio.test.ts) 가능하게 분리하고,
// 낭독 경로(뉴스·브리핑·팟캐스트 폴백)가 이 한 곳의 규칙을 공유하게 한다.
// 로컬 생성기(tools/lib/tts-normalize.mjs)는 동일 규칙의 JS 사본 — 바꿀 땐 양쪽을 함께.

// HTML 엔티티 디코딩 — 기사 본문에 &lsquo;·&ldquo;·&nbsp; 등이 섞여 오는데, 디코딩 안 하면
// TTS가 "그리고 lsquo" 같은 잡음을 읽는다. 정규화보다 먼저 실행해야 한다.
export function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&lsquo;|&rsquo;|&#8216;|&#8217;/g, "'")
    .replace(/&ldquo;|&rdquo;|&#8220;|&#8221;/g, '"')
    .replace(/&hellip;|&#8230;/g, "…").replace(/&middot;|&#183;/g, "·")
    .replace(/&ndash;|&#8211;/g, "-").replace(/&mdash;|&#8212;/g, "-")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch { return " "; } })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return " "; } })
    .replace(/&[a-zA-Z][a-zA-Z0-9]*;/g, " ");   // 남은 알 수 없는 엔티티 → 공백
}

// TTS용 텍스트 정규화 — 기호를 자연스러운 낭독으로 바꿔 "삼각형·대괄호" 같은 오낭독 방지.
// 뉴스 기사(태안신문)는 ▲를 항목 불릿으로 쓰고, 리포트/기사에 대괄호·따옴표·단위기호가 섞여 온다.
export function normalizeForTts(t: string): string {
  return decodeEntities(t)
    // 0) 낭독 가치 없는 노이즈 제거(백슬래시·언더스코어·별표·해시·캐럿·파이프)
    .replace(/[\\_*#^|]/g, " ")
    // 1) 숫자 범위: 3~4·3-4·3·4 → "3에서 4"
    .replace(/(\d)\s*[-–—~∼〜･·]\s*(\d)/g, "$1에서 $2")
    // 2) 단위 기호 → 한글
    .replace(/㎡/g, "제곱미터").replace(/㎥/g, "세제곱미터")
    .replace(/㎞/g, "킬로미터").replace(/㎝/g, "센티미터").replace(/㎜/g, "밀리미터")
    .replace(/㎏/g, "킬로그램").replace(/[ℓ㎖]/g, "리터").replace(/㎍/g, "마이크로그램")
    .replace(/℃/g, "도").replace(/°C?/g, "도")
    .replace(/\//g, " ")                                  // 슬래시(㎍/㎥ 등) → 공백('슬래시' 낭독 방지)
    // 3) 연산·통화 기호
    .replace(/\s*%/g, " 퍼센트")
    .replace(/(?<=\d)\s*\+|\+\s*(?=\d)/g, " 플러스 ").replace(/&/g, " 그리고 ")
    // 4) 불릿·추세·나열 기호 → 쉼표 휴지("삼각형" 낭독 방지)
    .replace(/[▲▼△▽▴▾◆◇◈●○◎■□▶▷◀◁★☆※]/g, ", ")
    .replace(/[·・‧∙•ㆍ]/g, ", ")
    // 5) 괄호·대괄호·중괄호 → 쉼표 휴지 / 따옴표류 → 제거
    .replace(/[（(［[【｛{]/g, ", ").replace(/[）)］\]】｝}]/g, ", ")
    .replace(/[“”"„«»「」『』〈〉《》]/g, "").replace(/[‘’']/g, "")
    // 6) 잔여 물결·말줄임·대시·골뱅이
    .replace(/[~∼〜]/g, " ").replace(/…|\.{3,}/g, ", ").replace(/[-–—]/g, " ").replace(/@/g, " ")
    // 7) 공백·중복 쉼표 정리
    .replace(/,\s*(?=[,.])/g, "").replace(/,\s*,+/g, ", ")
    .replace(/\s{2,}/g, " ").replace(/\s+([.,!?])/g, "$1")
    .replace(/(^|[.!?]\s*),\s*/g, "$1")   // 문두의 불필요 쉼표 제거
    .trim();
}

// 문장 단위 청크 — Chirp3-HD는 "긴 문장"만 거부(총량 아님)하므로, 문장은 통째로 두되
// 여러 문장을 한 요청에 묶어(≈550자) 이어붙임 seam을 줄여 자연스러운 낭독을 만든다.
export function chunkText(text: string, max = 550): string[] {
  const sents = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?。…])\s+/);
  const pieces: string[] = [];
  for (const s of sents) {
    if (s.length <= 240) { pieces.push(s); continue; }
    for (let i = 0; i < s.length; i += 200) pieces.push(s.slice(i, i + 200)); // 마침표 없는 초장문 강제 분할
  }
  const out: string[] = [];
  let buf = "";
  for (const p of pieces) {
    if ((buf + " " + p).length > max && buf) { out.push(buf); buf = p; }
    else buf = buf ? `${buf} ${p}` : p;
  }
  if (buf) out.push(buf);
  return out.filter(Boolean);
}
