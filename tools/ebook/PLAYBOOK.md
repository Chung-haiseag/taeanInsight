# 옛 신문/문서 디지털화 파이프라인 — 재사용 플레이북

스캔 PDF(신문·잡지·문서) → 검색·열람 가능한 **기사 단위 디지털 아카이브**로 만드는 전체 흐름.
태안신문 1991~2001 디지털화에서 정립. **다른 프로젝트에 그대로 이식 가능** (경로·바인딩만 교체).

---

## 1. 아키텍처 (단계)

```
PDF 지면
  └─ ① 렌더: pdftoppm 300dpi → PNG  (+ sips로 업로드용 JPEG 1568/1600/1800px)
  └─ ② OCR:  Google Cloud Vision DOCUMENT_TEXT_DETECTION (ko,zh) → 글자+박스
  └─ ③ 정렬: 컬럼 x-중심으로 정렬(columnSort) → 지면 텍스트 1벌
  └─ ④ 구조화(택1):
        · 지면 단위(PAGE_MODE): LLM 없이 한 면=한 레코드  → $0, 가장 빠름
        · 기사 단위: LLM이 기사 분리+제목+광고표시+띄어쓰기 교정
            - Gemini 2.5 Flash / Flash-Lite (권장·저가)  또는  Claude Haiku(고품질·고가)
  └─ ⑤ 저장: 지면 이미지 R2 업로드 + 기사 텍스트 JSONL → D1 적재(publish)
```

핵심 설계 원칙:
- **전사(OCR)는 Vision이 진실원천.** LLM은 "전사"가 아니라 "이미 정확한 텍스트를 기사로 분리"만 한다(지어내기 방지).
- **사진은 크롭하지 않고** 원본 지면 이미지를 공유(leadImage = 지면 스캔). 독자가 "원본 지면 보기"로 확인.
- **충실도 가드**: 기사 본문 vs 원본 면 텍스트의 한글 4-gram 겹침. 낮으면(<0.6) 버리고, <0.75는 경고. 공백은 무시 → 띄어쓰기 교정은 안전.

## 2. 두 단계 전략 (실전 권장)

비용·속도 때문에 **2단계**가 효율적이었다:
1. **먼저 지면 단위(PAGE_MODE)로 전 연도 빠르게 적재** — Vision만, $0, 원본 이미지까지 확보.
2. **나중에 Gemini로 기사 단위 재구조화** — 이미 저장된 지면 텍스트를 LLM에 넣어 분리(Vision 재실행 불필요!). `restructure-gemini.mjs`.

→ Vision OCR을 두 번 안 돌리고, LLM 비용도 가장 싼 모델로 한 번만.

## 3. 도구 (이 폴더)

| 파일 | 역할 |
|---|---|
| `digitize-ocr.mjs` | PDF→Vision OCR→(PAGE_MODE 또는 LLM 구조화)→JSONL + R2. 핵심. |
| `page.sh` | `sh page.sh <연도들>` → 지면 단위 일괄 (Vision only). |
| `restructure-gemini.mjs` | 기존 지면 JSONL → Gemini 기사 분리(체크포인트·이어하기). |
| `sample-gemini.mjs` | Gemini 분리 품질 미리보기(데이터 안 건드림). |
| `publish.mjs` | JSONL → D1 적재(새 날짜만, 재시도, 버전 URL). `--skip-spacing` |
| `fix-spacing.mjs` | (Haiku 경로용) 띄어쓰기 교정 — transferSpacing 글자보존. |

## 4. 명령 치트시트

```bash
# 환경 키 (택1+)
export GOOGLE_VISION_API_KEY=...      # OCR (필수)
export GEMINI_API_KEY=...             # 기사 구조화 (Gemini 경로)
export GEMINI_MODEL=gemini-2.5-flash-lite   # 저가 (기본 gemini-2.5-flash)
# export ANTHROPIC_API_KEY=...        # Haiku 경로(선택, 고가)

# A. 지면 단위 빠르게 (LLM 없음)
sh page.sh 1995 1996 1997 1998        # 여러 연도 순차
node publish.mjs --skip-spacing

# B. 기사 단위 재구조화 (지면 → 기사, Vision 재실행 없음)
node restructure-gemini.mjs 1995 1996 1997 1998 --conc 4   # 40면마다 저장·이어하기
#  → out/restructure_delete.txt(지울 옛 면 idxno) 생성
#  D1 반영: 그 idxno 삭제 후  node publish.mjs --dates <날짜들> --skip-spacing

# C. 바로 기사 단위 (PDF→Gemini)  — A를 건너뛸 때
GEMINI_API_KEY=... node digitize-ocr.mjs --dir <폴더>
```

## 5. 비용 (1면 기준)

| 단계 | 단가 | 비고 |
|---|---|---|
| Google Vision OCR | **$1.5 / 1,000면** | 월 1,000면 무료. 1면=1unit. |
| Gemini 2.5 Flash-Lite 구조화 | **~$0.001/면** | 4,757면 ≈ $3~5. 권장. |
| Gemini 2.5 Flash 구조화 | ~$0.005/면 | 출력단가 높음. ≈ $15~25. |
| Claude Haiku 구조화 | ~$0.017/면 | 고품질·고가. ≈ $80+. |
| R2 저장/이그레스 | 사실상 0 | |

## 6. 함정·교훈 (꼭 기억)

- **Gemini thinking 끄기**: `generationConfig.thinkingConfig={thinkingBudget:0}`. 안 끄면 호출당 20~40초+출력비용 폭증. 기사 분리엔 불필요.
- **무료 등급 rate-limit**: 분당 15건·일 1,500건. 대량이면 며칠. 빨리하려면 유료(Tier) 키.
- **중간 저장(체크포인트) 필수**: 장시간 작업은 N건마다 저장+이어하기. "끝에 1회 저장"은 중단 시 전부 손실.
- **폴더 이중중첩 주의**: `연도/연도/날짜/` 처럼 중첩되면 같은 면이 두 번 처리돼 중복 적재됨 → (date,page) 중복 제거 필요. 디스커버리는 `<dir>/<YYYY>/<YYYYMMDD>` 중첩을 지원.
- **세로쓰기(縱書) 신문**: Vision이 단을 뒤섞어 OCR이 부정확. (예: 1990년대 초) → 텍스트는 거칠고 원본 스캔만 신뢰. 별도 보류 권장.
- **R2 immutable 캐시**: 같은 키로 재업로드해도 안 바뀜 → 파일명 변경 또는 `?v=` 버전 파라미터.
- **D1 적재 재시도**: 네트워크/서버 일시오류(fetch failed/InternalError) 흔함 → 지수 백오프 재시도 + 완전한 문장 단위 배치(본문 줄바꿈으로 SQL 절단 방지).
- **저작권/게이트**: 자사 콘텐츠면 회원 로그인 세션으로 전문 수집 가능. 타사면 발췌+원문링크.
- **idxno 키스페이스**: 디지털화분을 별도 대역(예 90000001~90099999)에 두면 다른 데이터와 충돌 없이 통합.

## 7. 다른 프로젝트로 이식 시 바꿀 것

- 경로 상수: `OUT_*`, R2 버킷명(`R2_BUCKET`), `PHOTO_BASE`(Worker URL).
- D1 바인딩/테이블 스키마(`archive_articles`, FTS `archive_fts`).
- 폴더 규칙: `<BASE>/<YYYY>/<YYYYMMDD>/TA_<date>_<page>.pdf` (정규식 수정).
- 카테고리 후보(`CATS`)·분류 키워드.
- idxno 대역.
