"""검증 결과를 평가셋 JSON 파일에 일괄 반영하는 스크립트.

편집부가 checklist.md를 채워 checklist_completed.md로 저장한 후 실행:
    python apply_verification.py checklist_completed.md

처리 규칙:
- 'O' 표시 → verification_status = "verified"
- '△' + 수정사항 → 필드 갱신 후 verified
- 'X' 표시 → 해당 문항 JSON에서 제거

수정사항 양식:
    ANSWER: <new reference_answer>
    KEYWORDS: +추가 -제거
    SOURCE: <new source>
"""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

EVAL_ROOT = Path(__file__).resolve().parent.parent
DATASET_DIR = EVAL_ROOT / "dataset"
DOMAIN_FILES = {
    "TOUR": DATASET_DIR / "tourism.json",
    "ENV": DATASET_DIR / "environment.json",
    "RE": DATASET_DIR / "realestate.json",
    "GEN": DATASET_DIR / "general.json",
}


@dataclass
class Decision:
    item_id: str
    result: str                                # "O" | "△" | "X"
    answer_override: str | None = None
    keywords_add: list[str] = field(default_factory=list)
    keywords_remove: list[str] = field(default_factory=list)
    source_override: str | None = None
    raw_note: str = ""


def parse_checklist(path: Path) -> list[Decision]:
    """Markdown 표에서 결과·수정사항 추출."""
    text = path.read_text(encoding="utf-8")
    decisions: list[Decision] = []
    # 표 행 패턴: | TOUR-001 | ... | ... | O | KEYWORDS: ... |
    row_pat = re.compile(r"^\|\s*(TOUR|ENV|RE|GEN)-(\d{3})\s*\|", re.MULTILINE)
    for match in row_pat.finditer(text):
        line_start = match.start()
        line_end = text.find("\n", line_start)
        line = text[line_start:line_end]
        cells = [c.strip() for c in line.split("|")[1:-1]]
        if len(cells) < 6:
            continue
        item_id = cells[0]
        # 결과 컬럼은 끝에서 2번째, 수정사항은 끝
        result = cells[-2].strip()
        note = cells[-1].strip()
        # 빈 체크박스 ☐는 건너뛰기 (아직 검증 안 함)
        if result in ("☐", "", "-"):
            continue
        if result not in ("O", "△", "X"):
            print(f"⚠️  알 수 없는 결과 기호: {item_id} → '{result}' (건너뜀)", file=sys.stderr)
            continue
        d = Decision(item_id=item_id, result=result, raw_note=note)
        if result == "△":
            _parse_modifications(d, note)
        decisions.append(d)
    return decisions


def _parse_modifications(d: Decision, note: str) -> None:
    """수정사항 노트에서 ANSWER/KEYWORDS/SOURCE 추출."""
    # 줄바꿈을 보존하기 위해 <br>·`|` 이스케이프 처리 후에도 동작하도록
    note_clean = note.replace("<br>", "\n")
    for raw_line in note_clean.split("\n"):
        line = raw_line.strip()
        if not line:
            continue
        if line.upper().startswith("ANSWER:"):
            d.answer_override = line.split(":", 1)[1].strip()
        elif line.upper().startswith("KEYWORDS:"):
            value = line.split(":", 1)[1].strip()
            for token in value.split():
                if token.startswith("+"):
                    d.keywords_add.append(token[1:])
                elif token.startswith("-"):
                    d.keywords_remove.append(token[1:])
        elif line.upper().startswith("SOURCE:"):
            d.source_override = line.split(":", 1)[1].strip()


def apply_decisions(decisions: list[Decision]) -> dict:
    """각 도메인 JSON 파일을 갱신하고 로그 반환."""
    log = {
        "applied_at": datetime.utcnow().isoformat() + "Z",
        "total_decisions": len(decisions),
        "verified": 0,
        "modified": 0,
        "removed": 0,
        "errors": [],
        "details": [],
    }

    # 도메인 코드별로 그룹핑
    by_prefix: dict[str, list[Decision]] = {}
    for d in decisions:
        prefix = d.item_id.split("-")[0]
        by_prefix.setdefault(prefix, []).append(d)

    for prefix, ds in by_prefix.items():
        path = DOMAIN_FILES.get(prefix)
        if not path or not path.exists():
            log["errors"].append(f"파일 없음: {prefix}")
            continue
        items = json.loads(path.read_text(encoding="utf-8"))
        by_id = {it["id"]: it for it in items}
        new_items: list[dict] = []
        for it in items:
            d = next((x for x in ds if x.item_id == it["id"]), None)
            if d is None:
                new_items.append(it)
                continue
            if d.result == "X":
                log["removed"] += 1
                log["details"].append({"id": it["id"], "action": "removed"})
                continue
            if d.result == "△":
                if d.answer_override:
                    it["reference_answer"] = d.answer_override
                if d.keywords_add or d.keywords_remove:
                    kws = list(it.get("expected_keywords", []))
                    for k in d.keywords_remove:
                        kws = [x for x in kws if x != k]
                    for k in d.keywords_add:
                        if k not in kws:
                            kws.append(k)
                    it["expected_keywords"] = kws
                if d.source_override:
                    it["source"] = d.source_override
                log["modified"] += 1
            it["verification_status"] = "verified"
            log["verified"] += 1
            log["details"].append({"id": it["id"], "action": d.result, "note": d.raw_note[:120]})
            new_items.append(it)
        path.write_text(json.dumps(new_items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    log_path = Path(__file__).resolve().parent / "verification_log.json"
    log_path.write_text(json.dumps(log, ensure_ascii=False, indent=2), encoding="utf-8")
    return log


def main() -> None:
    if len(sys.argv) < 2:
        print("사용법: python apply_verification.py checklist_completed.md", file=sys.stderr)
        sys.exit(1)
    checklist_path = Path(sys.argv[1]).resolve()
    if not checklist_path.exists():
        print(f"❌ 파일 없음: {checklist_path}", file=sys.stderr)
        sys.exit(1)

    decisions = parse_checklist(checklist_path)
    if not decisions:
        print("⚠️  체크된 결과가 없습니다 (O/△/X 표기 후 다시 실행)")
        sys.exit(0)

    print(f"📥 결정 사항 {len(decisions)}건 파싱 완료")
    log = apply_decisions(decisions)
    print(f"\n✅ 처리 완료")
    print(f"   - verified: {log['verified']}개")
    print(f"   - 수정 반영: {log['modified']}개")
    print(f"   - 제거: {log['removed']}개")
    if log["errors"]:
        print(f"\n⚠️  에러: {log['errors']}")
    print(f"\n📄 상세 로그: verification_log.json")


if __name__ == "__main__":
    main()
