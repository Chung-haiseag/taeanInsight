"""채점 모듈 — 4가지 평가 방식 구현.

PRD v1.4 §6 REQ-INFRA-001 평가셋 채점 로직.
의존성 최소화: 표준 라이브러리만 사용. semantic은 임베딩 함수를 외부에서 주입.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable, Iterable


@dataclass
class ScoreResult:
    item_id: str
    method: str
    score: float           # 0.0 ~ 1.0
    passed: bool
    detail: str            # 채점 근거 (디버깅·보고용)


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def keyword_match(answer: str, keywords: Iterable[str], threshold: float = 0.5) -> ScoreResult:
    """답변에 핵심 키워드가 얼마나 포함되었는지 비율로 채점."""
    norm = _normalize(answer)
    hits = [kw for kw in keywords if _normalize(kw) in norm]
    total = len(list(keywords)) if not isinstance(keywords, list) else len(keywords)
    # keywords가 generator였을 경우를 대비해 재계산
    keywords_list = list(keywords) if not isinstance(keywords, list) else keywords
    total = len(keywords_list)
    hits = [kw for kw in keywords_list if _normalize(kw) in norm]
    score = (len(hits) / total) if total > 0 else 0.0
    return ScoreResult(
        item_id="",
        method="keyword_match",
        score=score,
        passed=score >= threshold,
        detail=f"matched {len(hits)}/{total}: {hits}",
    )


def exact(answer: str, expected: str) -> ScoreResult:
    """정확 일치 (공백·대소문자 정규화 후)."""
    matched = _normalize(answer) == _normalize(expected)
    return ScoreResult(
        item_id="",
        method="exact",
        score=1.0 if matched else 0.0,
        passed=matched,
        detail=f"normalized equality={matched}",
    )


def semantic(
    answer: str,
    reference: str,
    embed_fn: Callable[[str], list[float]],
    threshold: float = 0.85,
) -> ScoreResult:
    """임베딩 유사도 채점.

    embed_fn: 텍스트를 임베딩 벡터로 변환하는 외부 함수 (BGE-M3-Korean 등 권장).
    """
    va = embed_fn(answer)
    vb = embed_fn(reference)
    sim = _cosine_similarity(va, vb)
    return ScoreResult(
        item_id="",
        method="semantic",
        score=sim,
        passed=sim >= threshold,
        detail=f"cosine={sim:.4f} threshold={threshold}",
    )


def factual(answer: str, reference: str, judge_fn: Callable[[str, str], bool]) -> ScoreResult:
    """사실 검증 — 외부 judge 함수가 True/False 반환.

    judge_fn 예: 강력한 LLM에 "다음 답변이 정답과 동일한 사실을 말하는가?" 묻기.
    """
    matched = judge_fn(answer, reference)
    return ScoreResult(
        item_id="",
        method="factual",
        score=1.0 if matched else 0.0,
        passed=matched,
        detail=f"judge_fn={matched}",
    )


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(y * y for y in b) ** 0.5
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)


def score_item(item: dict, answer: str, embed_fn=None, judge_fn=None) -> ScoreResult:
    """item의 evaluation_method에 따라 적절한 채점 함수로 디스패치."""
    method = item["evaluation_method"]
    if method == "keyword_match":
        res = keyword_match(answer, item["expected_keywords"])
    elif method == "exact":
        res = exact(answer, item["reference_answer"])
    elif method == "semantic":
        if embed_fn is None:
            raise ValueError("semantic 채점에는 embed_fn이 필요합니다")
        res = semantic(answer, item["reference_answer"], embed_fn)
    elif method == "factual":
        if judge_fn is None:
            raise ValueError("factual 채점에는 judge_fn이 필요합니다")
        res = factual(answer, item["reference_answer"], judge_fn)
    else:
        raise ValueError(f"알 수 없는 평가 방식: {method}")
    res.item_id = item["id"]
    return res
