"""캐시 키 정규화 PoC — PRD v1.4 §6 REQ-AI-002.

목표: 동일 의미의 한국어 질의를 동일한 캐시 키로 매핑하여
캐시 히트율을 ≥ 75%로 끌어올린다.

설계 원칙:
- 외부 라이브러리 의존 최소화 (LLM 호출 전 가벼운 정규화로 끝남)
- 의미 변화 없는 표현 차이는 흡수 (공백·구두점·존댓말 어미 등)
- 의미 변화가 있는 차이는 보존 (지명·날짜·숫자)
"""

from __future__ import annotations

import hashlib
import re
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime


# ---------- 정규화 규칙 ----------

# 의미 변화 없는 종결 어미·존칭. "알려줘" "알려주세요" "알려줄래" 등은 같은 의미.
TRAILING_HONORIFIC_PATTERNS = [
    r"(주세요|주실래요|주시겠어요|주세용|주실수있나요)$",
    r"(알려줘|알려줄래|알려줘요|알려주실래요|알려주세요)$",
    r"(말해줘|말해주세요|말해줄래)$",
    r"(있나요|있어요|있을까요|있는가요|있는지)$",
    r"(인가요|입니까|이에요|예요|이죠)$",
    r"(되나요|되는지|되는가요|됩니까)$",
]

# 의미 없는 부사·관용구
FILLER_WORDS = [
    "혹시", "그런데", "아무튼", "그러니까", "음", "어",
    "한번", "한 번", "좀", "좀더", "조금",
    "정확히", "구체적으로", "자세하게", "자세히",
]

# 정규화 시 보존해야 할 패턴 (지명·시간·수치)
PRESERVE_PATTERNS = [
    r"\d+",                                  # 숫자
    r"\d{4}-\d{2}-\d{2}",                    # 날짜
    r"(태안|안면도|만리포|천리포|꽃지|신두리|가로림만|몽산포|근소만)",   # 주요 지명
]


@dataclass
class CacheKeyContext:
    """캐시 키 빌드 시 부가 컨텍스트."""
    domain: str | None = None              # tourism | environment | realestate | general
    location: str | None = None            # 읍·면 단위
    time_window: str | None = None         # "weekly" | "daily" | "current"
    user_tier: str | None = None           # "anon" | "b2c" | "b2b"


def normalize_query(query: str) -> str:
    """한국어 질의를 캐시 친화적 정규형으로 변환."""
    if not query:
        return ""

    # 유니코드 NFC 정규화 (한글 자모 결합 형태 통일)
    text = unicodedata.normalize("NFC", query)

    # 공백·탭·줄바꿈 → 단일 공백
    text = re.sub(r"\s+", " ", text).strip()

    # 양끝 구두점 제거
    text = text.strip("?!.,;:\"'`()[]{}")

    # 필러 단어 제거 (앞/중간/뒤 모두)
    for filler in FILLER_WORDS:
        text = re.sub(rf"(^|\s){re.escape(filler)}(\s|$)", " ", text)
    text = re.sub(r"\s+", " ", text).strip()

    # 종결 어미 정규화 (의문문·평서문 → 평서문 형태로 통일)
    for pattern in TRAILING_HONORIFIC_PATTERNS:
        text = re.sub(pattern, "", text)
    text = text.strip()

    # 소문자화 (영문 혼용 시)
    text = text.lower()

    return text


def build_cache_key(query: str, ctx: CacheKeyContext | None = None) -> str:
    """질의 + 컨텍스트로 결정론적 캐시 키 생성.

    형식: qa:{domain}:{location}:{time_window}:{user_tier}:{sha256-12}
    """
    ctx = ctx or CacheKeyContext()
    normalized = normalize_query(query)
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:12]

    return ":".join([
        "qa",
        ctx.domain or "general",
        ctx.location or "all",
        ctx.time_window or "current",
        ctx.user_tier or "anon",
        digest,
    ])


def ttl_for(time_window: str) -> int:
    """캐시 TTL 정책 (초). PRD §6 REQ-AI-002 명시."""
    return {
        "weekly_report": 7 * 86400,        # 주간 리포트
        "weekly": 7 * 86400,
        "daily": 86400,                    # 일반 답변
        "current": 86400,                  # 기본
        "market_data": 6 * 3600,           # 시세 (6시간)
        "realtime": 600,                   # 실시간 데이터 (10분)
    }.get(time_window, 86400)


# ---------- 자체 검증 (간이 테스트) ----------

def _self_test() -> None:
    """질의 변형이 모두 같은 키로 정규화되는지 검증."""
    variants = [
        "다음 주 안면도 미세먼지 예보 알려줘",
        "다음 주 안면도 미세먼지 예보 알려주세요?",
        "혹시 다음 주 안면도 미세먼지 예보 알려줘",
        "  다음 주 안면도 미세먼지 예보 알려주실래요?  ",
        "다음 주 안면도 미세먼지 예보 알려줄래요.",
    ]
    ctx = CacheKeyContext(domain="environment", location="anmyeon", time_window="weekly")
    keys = {build_cache_key(q, ctx) for q in variants}
    assert len(keys) == 1, f"변형 {len(variants)}개가 모두 같은 키로 정규화되어야 함. 실제: {keys}"
    print(f"✅ 5개 변형 모두 같은 키로 정규화: {list(keys)[0]}")

    # 의미가 다른 질의는 키가 달라야 함
    different = build_cache_key("다음 주 만리포 미세먼지 예보", ctx)
    assert different not in keys, "다른 지명은 다른 키여야 함"
    print(f"✅ 다른 지명 질의는 다른 키: {different}")

    # 도메인이 다르면 키가 달라야 함
    different_domain = build_cache_key(
        variants[0],
        CacheKeyContext(domain="tourism", location="anmyeon", time_window="weekly"),
    )
    assert different_domain not in keys, "다른 도메인은 다른 키여야 함"
    print(f"✅ 다른 도메인 질의는 다른 키: {different_domain}")

    # TTL 정책
    assert ttl_for("weekly_report") == 7 * 86400
    assert ttl_for("current") == 86400
    assert ttl_for("market_data") == 6 * 3600
    print("✅ TTL 정책 정상")


if __name__ == "__main__":
    _self_test()
    print("\n🎯 캐시 키 정규화 PoC 검증 완료")
