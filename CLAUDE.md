# 태안 인사이트 — 프로젝트 지침 (CLAUDE.md)

지역 AI 인텔리전스 플랫폼. 전역 지침(`~/.claude/CLAUDE.md`)에 더해 이 프로젝트 고유 규칙.
**상세는 [`RUNBOOK.md`](./RUNBOOK.md)(전체 운영) · [`tools/ebook/PLAYBOOK.md`](./tools/ebook/PLAYBOOK.md)(디지털화).**

## 스택·바인딩
- 백엔드: Cloudflare Workers + Hono (`backend/`), Worker명 `taean-insight-api`.
- 프론트: Next.js + OpenNext on Workers (`web/`), Worker명 `taean-insight`.
- D1: `taean-archive` (기사 `archive_articles`, 검색 `archive_fts` FTS5 트라이그램).
- R2: `taean-archive-photos` (지면·사진).
- LLM: Workers AI(무료, AI질의·copilot) / Gemini(디지털화). 운영 Worker는 Claude API 미사용.

## 배포 (cwd 주의)
```bash
cd /Applications/taean/backend && npx wrangler deploy
cd /Applications/taean/web && npm run deploy:cf      # cd 경로 꼭 web 절대경로로 (상대 cd web 금지)
# D1 마이그레이션: npx wrangler d1 execute taean-archive --remote --file db/migrations/NNN.sql
```
- 프로덕션 배포·D1 대량삭제는 사용자 승인 후.

## 시크릿 (Worker)
- `TAEAN_ID` / `TAEAN_PW` — 태안신문 회원 로그인(기사 전문 수집).
- `DATA_GO_KR_KEY` — 공공데이터(날씨·대기질·관광).
- (로컬 디지털화용) `GOOGLE_VISION_API_KEY`, `GEMINI_API_KEY` — Worker 아님, 사용자 터미널.

## Cron
- 매일 자정 KST = `0 15 * * *`(UTC). 뉴스 수집 + 환경 스냅샷 + 비용 집계. `backend/src/index.ts` scheduled().

## 디지털화 규칙
- **노 Claude API**: OCR=Google Vision, 기사분리=Gemini Flash-Lite(thinking off). (옛 Haiku 경로는 비쌈, 지양)
- **1990년 보류**: 세로쓰기라 OCR 부정확. 작업 재개 시 사용자에게 알릴 것. 현재 1991~2001 라이브.
- 전자북 idxno 대역: **90000001~90099999**. 지면이미지는 R2 `ebook/<날짜>/page_NN.jpg`.
- 흐름: `sh tools/ebook/page.sh <연도>` → `node publish.mjs --skip-spacing`. 기사화는 `restructure-gemini.mjs`.

## 관례
- 새 기능 라이브 반영 시 **RUNBOOK.md §5 기능 로그에 한 줄 추가** (`YYYY-MM-DD · 기능 · 위치`).
- 뉴스 자동수집은 RSS 정체 대비 **기사목록 병합**. taeannews 전문은 **회원 로그인 세션** 필요.
- AI 질의는 **아카이브 RAG + 실시간(날씨·대기질) 근거**로 출처 표기.
