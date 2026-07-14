// TTS 낭독용 텍스트 전처리(로컬 생성기 공유) — backend/src/audio/text.ts와 동일 규칙.
// 뉴스 낭독·팟캐스트·브리핑 생성기가 이 한 곳을 import 한다. 규칙 변경 시 text.ts와 함께 수정.

// HTML 엔티티 디코딩 — &lsquo;·&ldquo;·&nbsp; 등을 안 풀면 TTS가 "그리고 lsquo"를 읽는다.
export function decodeEntities(s) {
  return (s || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lsquo;|&rsquo;|&#8216;|&#8217;/g, "'").replace(/&ldquo;|&rdquo;|&#8220;|&#8221;/g, '"')
    .replace(/&hellip;|&#8230;/g, "…").replace(/&middot;|&#183;/g, "·")
    .replace(/&ndash;|&#8211;/g, "-").replace(/&mdash;|&#8212;/g, "-")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch { return " "; } })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return " "; } })
    .replace(/&[a-zA-Z][a-zA-Z0-9]*;/g, " ");
}

// 특수문자 정규화 — ▲불릿·괄호·따옴표·단위기호를 자연스러운 낭독으로. 엔티티 디코딩을 먼저 수행.
export function ttsClean(t) {
  return decodeEntities(t)
    .replace(/[\\_*#^|]/g, " ")
    .replace(/(\d)\s*[-–—~∼〜･·]\s*(\d)/g, "$1에서 $2")
    .replace(/㎡/g, "제곱미터").replace(/㎥/g, "세제곱미터").replace(/㎞/g, "킬로미터").replace(/㎝/g, "센티미터").replace(/㎜/g, "밀리미터")
    .replace(/㎏/g, "킬로그램").replace(/[ℓ㎖]/g, "리터").replace(/㎍/g, "마이크로그램").replace(/℃/g, "도").replace(/°C?/g, "도").replace(/\//g, " ")
    .replace(/\s*%/g, " 퍼센트").replace(/(?<=\d)\s*\+|\+\s*(?=\d)/g, " 플러스 ").replace(/&/g, " 그리고 ")
    .replace(/[▲▼△▽▴▾◆◇◈●○◎■□▶▷◀◁★☆※]/g, ", ").replace(/[·・‧∙•ㆍ]/g, ", ")
    .replace(/[（(［[【｛{]/g, ", ").replace(/[）)］\]】｝}]/g, ", ").replace(/[“”"„«»「」『』〈〉《》]/g, "").replace(/[‘’']/g, "")
    .replace(/[~∼〜]/g, " ").replace(/…|\.{3,}/g, ", ").replace(/[-–—]/g, " ").replace(/@/g, " ")
    .replace(/,\s*(?=[,.])/g, "").replace(/,\s*,+/g, ", ").replace(/\s{2,}/g, " ").replace(/\s+([.,!?])/g, "$1").replace(/(^|[.!?]\s*),\s*/g, "$1").trim();
}
