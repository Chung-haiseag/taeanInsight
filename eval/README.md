# Taean LLM Evaluation Dataset

태안 AI 인텔리전스 커먼즈 플랫폼 LLM 벤치마크용 평가셋 (PRD v1.4 §6 REQ-INFRA-001).

## 목적

Phase 1 (2026-05~06) LLM 선정을 위한 객관적 비교 도구:
- **Together AI Solar Mini** (실시간 채널 후보)
- **Anthropic Claude Haiku** (Batch API 채널 후보)
- **(참고용) Llama-3.1-8B 자체 호스팅**

3종 모델을 같은 평가셋으로 측정하여 정확도·환각률·응답 시간·비용을 비교.

## 현재 상태 (2026-05-27)

- ✅ 스키마 (`schema.json`) 정의 완료
- ✅ 샘플 50문항 작성 (4개 도메인 × 12~13문항)
- ⏳ **나머지 450문항 — Phase 1 종료(6/30)까지 확장 예정**
- ✅ 평가 스크립트 골격 작성 완료
- ⏳ Anthropic·Together AI API 키 발급 후 실측 (TaskMaster #1 의존)

## 디렉토리 구조

```
eval/
├── schema.json                 # JSON Schema (문항 데이터 무결성)
├── README.md                   # 이 문서
├── dataset/
│   ├── tourism.json            # 관광 12문항 (목표 125)
│   ├── environment.json        # 환경 12문항 (목표 125)
│   ├── realestate.json         # 부동산 13문항 (목표 125)
│   └── general.json            # 일반·시사 13문항 (목표 125)
└── evaluator/
    ├── scoring.py              # 4가지 채점 방식
    └── run_benchmark.py        # 3종 모델 벤치마크 실행기
```

## 문항 구조

각 문항은 `schema.json`의 JSON Schema를 따릅니다. 핵심 필드:

| 필드 | 의미 |
|---|---|
| `id` | `TOUR-001`, `ENV-042` 등 도메인 코드 + 3자리 |
| `domain` | tourism / environment / realestate / general |
| `difficulty` | easy / medium / hard (분포 권장 30/50/20) |
| `question` | LLM에 그대로 전달할 한국어 질문 |
| `expected_keywords` | 답변에 포함되어야 할 키워드 |
| `reference_answer` | 정답 예시 (semantic·factual 채점 기준) |
| `source` | 출처 (환각률 측정 기준) |
| `evaluation_method` | `keyword_match` / `exact` / `semantic` / `factual` |
| `verification_status` | `verified` / `needs_verification` / `draft` |

### 채점 방식 4종

| 방식 | 설명 | 점수 |
|---|---|---|
| `keyword_match` | 핵심 키워드 포함 비율 | 0.0 ~ 1.0 (포함율) |
| `exact` | 정확 일치 (공백·대소문자 정규화) | 0 또는 1 |
| `semantic` | 임베딩 코사인 유사도 ≥ 0.85 | 유사도값 |
| `factual` | 외부 LLM judge가 사실 일치 판정 | 0 또는 1 |

## 사용 방법

### 1) 환경 변수 설정

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export TOGETHER_API_KEY="..."
```

### 2) 의존성 설치

```bash
pip install httpx
```

### 3) 벤치마크 실행

```bash
cd evaluator
python run_benchmark.py --dataset ../dataset --output report.json

# 특정 모델만
python run_benchmark.py --models together_solar --limit 10

# 결과 보기
cat report.json | jq '.models | to_entries | map({key, accuracy: .value.accuracy})'
```

### 4) 출력 예시

```
======================================================================
Model                         Acc    Score    Latency
----------------------------------------------------------------------
together_solar               72.0%    0.785      1.42s
anthropic_haiku              78.0%    0.820      0.91s
======================================================================

Domain-level accuracy:
Model                         environment       general    realestate       tourism
----------------------------------------------------------------------------------
together_solar                       75.0%         70.5%         71.2%         72.8%
anthropic_haiku                      80.0%         78.5%         77.8%         78.0%
```

## 평가셋 작성 가이드

새 문항 추가 시:

1. **도메인 균형** — 각 도메인 125문항을 목표로 균등 분배
2. **난이도 분포** — easy 30% / medium 50% / hard 20%
3. **검증 가능성** — `source` 필드에 검증 가능한 출처 명시
4. **태안 특화** — 일반 LLM이 모를 만한 태안 지역 컨텍스트 우선
5. **민감 주제 회피** — PRD §6 REQ-GOV-001 7종 카테고리(선거·범죄·의료·종교·정치적 인물·부동산 투기 자문·소수자 이슈)는 평가셋에 포함하지 않음 (이는 차단 분류기 별도 테스트셋에서 다룸)

## 검증 워크플로

`verification_status` 단계:
- `draft` — Claude/AI가 1차 작성, 사실 미검증
- `needs_verification` — 태안신문 편집부 검증 대기
- `verified` — 편집부 확인 완료, 사용 가능

**현재 50문항 중 `verified`: 약 15문항, `needs_verification`: 약 35문항.**
편집부 검증 후 Phase 1 벤치마크에 사용 권장.

## CI 통합 (계획)

Phase 2C 종료 시점부터 GitHub Actions에서 매 PR마다 평가셋 자동 회귀:
- 신규 LLM 프롬프트 변경이 정확도를 5%p 이상 떨어뜨리면 PR 차단
- 모델 교체 시 회귀 테스트 자동 실행

## 관련 PRD·태스크

- PRD: `.taskmaster/docs/prd.md` §6 REQ-INFRA-001
- TaskMaster: #4 (Build Korean Custom Evaluation Dataset) — in-progress
- 예산: §4 데이터 수집·인프라 구축 3,000,000원 (v1.3 재배분 100만원 평가셋 강화 포함)
