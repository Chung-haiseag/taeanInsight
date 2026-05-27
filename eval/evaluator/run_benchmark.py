"""LLM 벤치마크 실행기 — 평가셋을 3종 모델에 동시 적용하고 모델별 점수표 출력.

PRD v1.4 §6 REQ-INFRA-001 Phase 1 벤치마크 자동화.

사용 예:
    python run_benchmark.py --dataset ../dataset --models together_solar anthropic_haiku
    python run_benchmark.py --dataset ../dataset --output report.json

환경 변수:
    ANTHROPIC_API_KEY  — Anthropic Batch API
    TOGETHER_API_KEY   — Together AI Solar Mini
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path
from typing import Awaitable, Callable

from scoring import score_item, ScoreResult


# ---------- 모델 클라이언트 추상화 ----------
ModelFn = Callable[[str], Awaitable[str]]


async def call_together_solar_mini(question: str) -> str:
    """Together AI Solar Mini 호출 (실시간 채널)."""
    try:
        import httpx
    except ImportError as e:
        raise RuntimeError("httpx가 필요합니다: pip install httpx") from e

    api_key = os.environ.get("TOGETHER_API_KEY")
    if not api_key:
        raise RuntimeError("TOGETHER_API_KEY 환경변수가 설정되지 않았습니다")

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            "https://api.together.xyz/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": "upstage/SOLAR-10.7B-Instruct-v1.0",
                "messages": [
                    {"role": "system", "content": "당신은 충남 태안 지역 전문가입니다. 정확한 사실만 답하세요."},
                    {"role": "user", "content": question},
                ],
                "max_tokens": 500,
                "temperature": 0.1,
            },
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]


async def call_anthropic_haiku(question: str) -> str:
    """Anthropic Claude Haiku 호출 (배치 채널 — 여기서는 동기 호출 데모)."""
    try:
        import httpx
    except ImportError as e:
        raise RuntimeError("httpx가 필요합니다: pip install httpx") from e

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다")

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 500,
                "system": "당신은 충남 태안 지역 전문가입니다. 정확한 사실만 답하세요.",
                "messages": [{"role": "user", "content": question}],
            },
        )
        resp.raise_for_status()
        return resp.json()["content"][0]["text"]


MODEL_REGISTRY: dict[str, ModelFn] = {
    "together_solar": call_together_solar_mini,
    "anthropic_haiku": call_anthropic_haiku,
    # 추가 모델: "llama_31_8b": call_llama_8b (자체 호스팅 시 활성화)
}


# ---------- 데이터셋 로딩 ----------
def load_dataset(dataset_dir: Path) -> list[dict]:
    items: list[dict] = []
    for json_file in sorted(dataset_dir.glob("*.json")):
        with json_file.open(encoding="utf-8") as f:
            items.extend(json.load(f))
    return items


# ---------- 실행 ----------
async def run_one(model_name: str, model_fn: ModelFn, item: dict) -> tuple[ScoreResult, str, float]:
    """단일 문항을 단일 모델에 호출하고 채점."""
    started = time.monotonic()
    try:
        answer = await model_fn(item["question"])
    except Exception as e:
        elapsed = time.monotonic() - started
        return (
            ScoreResult(item_id=item["id"], method=item["evaluation_method"], score=0.0, passed=False, detail=f"ERROR: {e}"),
            "",
            elapsed,
        )
    elapsed = time.monotonic() - started
    result = score_item(item, answer)
    return result, answer, elapsed


async def run_benchmark(items: list[dict], models: list[str]) -> dict:
    report: dict = {"models": {}, "items_total": len(items)}

    for model_name in models:
        if model_name not in MODEL_REGISTRY:
            print(f"⚠️  알 수 없는 모델: {model_name}", file=sys.stderr)
            continue
        model_fn = MODEL_REGISTRY[model_name]
        print(f"\n▶ {model_name} 실행 중 ({len(items)}문항)...")

        # 병렬 호출 (rate limit 고려해 동시 8개)
        sem = asyncio.Semaphore(8)

        async def bound(item):
            async with sem:
                return await run_one(model_name, model_fn, item)

        results = await asyncio.gather(*(bound(it) for it in items))

        passed = sum(1 for r, _, _ in results if r.passed)
        avg_score = sum(r.score for r, _, _ in results) / len(results) if results else 0.0
        avg_latency = sum(t for _, _, t in results) / len(results) if results else 0.0
        domain_scores: dict[str, list[float]] = {}
        for (r, _, _), item in zip(results, items):
            domain_scores.setdefault(item["domain"], []).append(r.score)

        report["models"][model_name] = {
            "passed": passed,
            "total": len(items),
            "accuracy": passed / len(items) if items else 0.0,
            "avg_score": avg_score,
            "avg_latency_sec": avg_latency,
            "by_domain": {d: sum(s) / len(s) for d, s in domain_scores.items()},
            "items": [
                {
                    "id": r.item_id,
                    "score": r.score,
                    "passed": r.passed,
                    "latency_sec": t,
                    "answer": a[:300] + ("..." if len(a) > 300 else ""),
                    "detail": r.detail,
                }
                for r, a, t in results
            ],
        }
        print(f"   accuracy={passed}/{len(items)} ({100*passed/len(items):.1f}%) avg_score={avg_score:.3f} avg_latency={avg_latency:.2f}s")

    return report


def print_summary(report: dict) -> None:
    print("\n" + "=" * 70)
    print(f"{'Model':<24} {'Acc':>8} {'Score':>8} {'Latency':>10}")
    print("-" * 70)
    for name, m in report["models"].items():
        print(f"{name:<24} {m['accuracy']*100:>7.1f}% {m['avg_score']:>8.3f} {m['avg_latency_sec']:>9.2f}s")
    print("=" * 70)

    print("\nDomain-level accuracy:")
    domains = set()
    for m in report["models"].values():
        domains.update(m["by_domain"].keys())
    domains = sorted(domains)
    header = f"{'Model':<24} " + " ".join(f"{d:>14}" for d in domains)
    print(header)
    print("-" * len(header))
    for name, m in report["models"].items():
        row = f"{name:<24} " + " ".join(f"{m['by_domain'].get(d, 0)*100:>13.1f}%" for d in domains)
        print(row)
    print()


def main() -> None:
    parser = argparse.ArgumentParser(description="태안 LLM 평가셋 벤치마크")
    parser.add_argument("--dataset", default="../dataset", help="평가셋 디렉토리")
    parser.add_argument("--models", nargs="+", default=list(MODEL_REGISTRY.keys()), help="평가할 모델 이름들")
    parser.add_argument("--output", default="report.json", help="결과 JSON 저장 경로")
    parser.add_argument("--limit", type=int, default=0, help="처리할 최대 문항 수 (0=전체)")
    args = parser.parse_args()

    dataset_dir = Path(args.dataset).resolve()
    if not dataset_dir.exists():
        print(f"❌ 데이터셋 디렉토리 없음: {dataset_dir}", file=sys.stderr)
        sys.exit(1)

    items = load_dataset(dataset_dir)
    if args.limit > 0:
        items = items[: args.limit]
    print(f"📂 데이터셋 로드 완료: {len(items)} 문항")

    report = asyncio.run(run_benchmark(items, args.models))

    output_path = Path(args.output).resolve()
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"\n💾 결과 저장: {output_path}")

    print_summary(report)


if __name__ == "__main__":
    main()
