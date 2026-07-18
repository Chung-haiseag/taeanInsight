// 웹 보강 발동 판정(순수). 로컬(아카이브+실시간)이 약하거나 최신-상황 질문이면 true.

// 최신·상황 신호 — 아카이브에 없을 법한 '지금'의 정보를 묻는 질문.
const CURRENT_RE = /속보|방금|최근|근황|현재\s?상황|오늘\s?발표|막\s?발표|이번\s?주\s?(발표|공고|소식)/;

export function needsWeb(query: string, parts: Array<{ source: { url: string | null } }>): boolean {
  if (CURRENT_RE.test(query)) return true;
  const hasArchive = parts.some((p) => typeof p.source.url === "string" && p.source.url.startsWith("/news/"));
  const hasRealtime = parts.some((p) => p.source.url === null);
  return !hasArchive && !hasRealtime;
}
