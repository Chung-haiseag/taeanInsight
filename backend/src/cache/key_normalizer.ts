// 캐시 키 정규화 — TypeScript 포팅 (원본: src/cache/key_normalizer.py)
// PRD v1.8 §6 REQ-AI-002 — 캐시 히트율 75% 목표

// 의미 변화 없는 종결 어미·존칭.
// 순서 주의: 요청 동사를 포함한 어미(알려주세요·말해주세요)를 짧은 "주세요"보다 먼저 제거한다.
// 안 그러면 "알려주세요"에서 "주세요"만 떨어져 "알려"가 남아, "알려줘"와 정규화 결과가 달라진다.
const TRAILING_HONORIFIC_PATTERNS: RegExp[] = [
  /(알려줘|알려줄래|알려줘요|알려주실래요|알려주세요)$/,
  /(말해줘|말해주세요|말해줄래)$/,
  /(주세요|주실래요|주시겠어요|주세용|주실수있나요)$/,
  /(있나요|있어요|있을까요|있는가요|있는지)$/,
  /(인가요|입니까|이에요|예요|이죠)$/,
  /(되나요|되는지|되는가요|됩니까)$/,
];

const FILLER_WORDS = [
  "혹시", "그런데", "아무튼", "그러니까", "음", "어",
  "한번", "한 번", "좀", "좀더", "조금",
  "정확히", "구체적으로", "자세하게", "자세히",
];

export interface CacheKeyContext {
  domain?: string;                  // tourism · environment · realestate · general
  location?: string;                // 읍·면 코드
  timeWindow?: string;              // weekly · daily · current
  userTier?: string;                // anon · b2c · b2b · b2g
}

export function normalizeQuery(query: string): string {
  if (!query) return "";

  // 유니코드 정규화
  let text = query.normalize("NFC");

  // 공백 정규화
  text = text.replace(/\s+/g, " ").trim();

  // 양끝 구두점 제거
  text = text.replace(/^[?!.,;:"'`()[\]{}]+|[?!.,;:"'`()[\]{}]+$/g, "");

  // 필러 단어 제거
  for (const filler of FILLER_WORDS) {
    const re = new RegExp(`(^|\\s)${escapeRegex(filler)}(\\s|$)`, "g");
    text = text.replace(re, " ");
  }
  text = text.replace(/\s+/g, " ").trim();

  // 종결 어미 제거
  for (const pattern of TRAILING_HONORIFIC_PATTERNS) {
    text = text.replace(pattern, "");
  }
  text = text.trim();

  // 소문자화 (영문 혼용 시)
  text = text.toLowerCase();

  return text;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function buildCacheKey(query: string, ctx: CacheKeyContext = {}): Promise<string> {
  const normalized = normalizeQuery(query);
  const digest = await sha256Hex(normalized);
  return [
    "qa",
    ctx.domain ?? "general",
    ctx.location ?? "all",
    ctx.timeWindow ?? "current",
    ctx.userTier ?? "anon",
    digest.slice(0, 12),
  ].join(":");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// TTL 정책
const TTL_POLICY: Record<string, number> = {
  weekly_report: 7 * 86400,
  weekly: 7 * 86400,
  daily: 86400,
  current: 86400,
  market_data: 6 * 3600,
  realtime: 600,
};

export function ttlFor(timeWindow: string): number {
  return TTL_POLICY[timeWindow] ?? 86400;
}

// 캐시 저장소 추상화
export interface CacheStore {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T, ttlSeconds: number): Promise<void>;
}

// 인메모리 구현체 (테스트·로컬 PoC)
export class InMemoryCacheStore implements CacheStore {
  private map = new Map<string, { value: unknown; expiresAt: number }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.map.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  size(): number {
    return this.map.size;
  }
}

/**
 * 엣지 캐시(Cache API) 열쇠에 **배포 판번호**를 섞는다(순수).
 *
 *   ⚠ Cache API 항목은 colo마다 따로 살아 있고 **배포는 그것을 깨지 않는다.**
 *     인물 프로필의 소속 연도를 고쳐 배포했더니 같은 주소가 옛 값과 새 값을
 *     번갈아 냈다(2026-08-27, s-maxage=900이라 최대 15분). 관계망을 고쳤을 때도
 *     "동일하게 보인다"는 말이 나온 원인이 이것이었다.
 *   판번호를 열쇠에 넣으면 배포하는 순간 모든 colo가 저절로 새로 받아 간다.
 *   판번호를 모르면(바인딩 없음) 옛 동작 그대로 주소만 쓴다.
 */
export function edgeCacheKey(url: string, version: string | undefined | null): string {
  if (!version) return url;
  const u = new URL(url);
  u.searchParams.set("__v", version);   // 캐시 열쇠 전용 — 실제 처리에는 안 쓴다
  return u.toString();
}
