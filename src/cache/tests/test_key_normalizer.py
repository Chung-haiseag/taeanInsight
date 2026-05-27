"""단위 테스트 — 캐시 키 정규화.

실행: python -m pytest src/cache/tests/test_key_normalizer.py -v
"""

from __future__ import annotations

import sys
from pathlib import Path

# src/cache 모듈 import 경로
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from key_normalizer import (  # noqa: E402
    CacheKeyContext,
    build_cache_key,
    normalize_query,
    ttl_for,
)


# ---------- normalize_query ----------

def test_normalize_strips_whitespace():
    assert normalize_query("  안녕  ") == "안녕"


def test_normalize_collapses_internal_spaces():
    assert normalize_query("안녕     하세요") == "안녕"  # 종결 어미 제거됨


def test_normalize_removes_question_mark():
    assert normalize_query("태안은 어디?") == "태안은 어디"


def test_normalize_removes_filler_words():
    assert "혹시" not in normalize_query("혹시 태안 날씨")
    assert "한번" not in normalize_query("한번 태안 가볼래")


def test_normalize_removes_trailing_honorific():
    # 모두 같은 핵심 의미
    a = normalize_query("태안 날씨 알려주세요")
    b = normalize_query("태안 날씨 알려줘")
    c = normalize_query("태안 날씨 알려주실래요")
    assert a == b == c


def test_normalize_preserves_location():
    # 지명은 보존되어야 함
    assert "안면도" in normalize_query("안면도 날씨")
    assert "만리포" in normalize_query("만리포 미세먼지")


def test_normalize_preserves_numbers_and_dates():
    assert "2026" in normalize_query("2026년 태안 인구")
    assert "30" in normalize_query("30대 귀촌 인구")


def test_normalize_empty_input():
    assert normalize_query("") == ""
    assert normalize_query("   ") == ""


# ---------- build_cache_key ----------

def test_cache_key_format():
    key = build_cache_key("태안 날씨")
    parts = key.split(":")
    assert parts[0] == "qa"
    assert parts[1] == "general"        # default domain
    assert parts[2] == "all"             # default location
    assert parts[3] == "current"         # default window
    assert parts[4] == "anon"            # default tier
    assert len(parts[5]) == 12           # sha256 12-char


def test_cache_key_collapses_query_variants():
    """5개 의문문 변형이 같은 키여야 함 — 캐시 히트율 핵심."""
    ctx = CacheKeyContext(domain="environment", location="anmyeon", time_window="weekly")
    variants = [
        "다음 주 안면도 미세먼지 예보 알려줘",
        "다음 주 안면도 미세먼지 예보 알려주세요?",
        "혹시 다음 주 안면도 미세먼지 예보 알려줘",
        "  다음 주 안면도 미세먼지 예보 알려주실래요?  ",
        "다음 주 안면도 미세먼지 예보 알려줄래요.",
    ]
    keys = {build_cache_key(q, ctx) for q in variants}
    assert len(keys) == 1, f"5개 변형이 같은 키여야 함. 실제: {keys}"


def test_cache_key_distinguishes_locations():
    ctx = CacheKeyContext(domain="environment")
    k1 = build_cache_key("안면도 미세먼지", ctx)
    k2 = build_cache_key("만리포 미세먼지", ctx)
    assert k1 != k2


def test_cache_key_distinguishes_domains():
    k_env = build_cache_key("태안 정보", CacheKeyContext(domain="environment"))
    k_tour = build_cache_key("태안 정보", CacheKeyContext(domain="tourism"))
    assert k_env != k_tour


def test_cache_key_distinguishes_time_windows():
    k_week = build_cache_key("태안 관광 예측", CacheKeyContext(time_window="weekly"))
    k_day = build_cache_key("태안 관광 예측", CacheKeyContext(time_window="daily"))
    assert k_week != k_day


def test_cache_key_distinguishes_user_tiers():
    """B2B 응답은 상세도가 다를 수 있으므로 별도 캐시."""
    k_b2c = build_cache_key("태안 관광 예측", CacheKeyContext(user_tier="b2c"))
    k_b2b = build_cache_key("태안 관광 예측", CacheKeyContext(user_tier="b2b"))
    assert k_b2c != k_b2b


def test_cache_key_deterministic():
    """같은 입력 → 같은 출력 (TTL 동안 안정성)."""
    ctx = CacheKeyContext(domain="environment", location="anmyeon")
    k1 = build_cache_key("미세먼지 알려줘", ctx)
    k2 = build_cache_key("미세먼지 알려줘", ctx)
    assert k1 == k2


# ---------- TTL 정책 ----------

def test_ttl_policy():
    assert ttl_for("weekly_report") == 7 * 86400
    assert ttl_for("weekly") == 7 * 86400
    assert ttl_for("daily") == 86400
    assert ttl_for("current") == 86400
    assert ttl_for("market_data") == 6 * 3600
    assert ttl_for("realtime") == 600
    assert ttl_for("unknown_value") == 86400   # default
