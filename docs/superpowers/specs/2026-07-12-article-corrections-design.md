# 전자북 기사 수정 요청 · 관리자 수정 — 설계

2026-07-12 승인. 요구: 디지털화(OCR) 기사의 오탈자를 ① 회원이 수정 요청 → ② 관리자 확인 → ③ 관리자 수정.

## 결정 사항 (사용자 확정)

- 대상: **전자북 기사만** (idxno 90000001~90099999, 본문이 D1에 있어 수정 가능)
- 자격: **로그인 회원 누구나** (identifyUser — 익명 데모 uid 포함, 프론트는 회원 상태에서만 버튼 노출)
- 결과 확인: **내 페이지** "내 수정 요청" 목록 (Web Push 없음)

## 접근 방식

텍스트 선택 기반 요청(A) + 관리자 화면 자동 치환 보조(C). 회원이 본문에서 틀린 부분을
드래그하면 해당 문구가 폼에 자동 입력. 관리자는 요청 옆 본문 편집기에서 "제안대로 치환"
(선택 문구가 본문에 유일하게 일치할 때만) 또는 수동 편집 후 저장 → 승인/반려.

## DB — `db/migrations/030_article_corrections.sql`

```sql
CREATE TABLE article_corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idxno INTEGER NOT NULL,          -- 대상 기사(전자북 대역)
  uid TEXT NOT NULL,               -- 요청 회원(JWT sub 또는 X-Taean-Uid)
  selected_text TEXT NOT NULL,     -- 지목한 원문 일부
  suggestion TEXT NOT NULL,        -- 제안 문구
  note TEXT,                       -- 요청 사유(선택)
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | rejected
  admin_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);
-- + status·uid 인덱스
-- + archive_fts UPDATE 동기화 트리거(archive_au) — 기존 스키마에 없어서 본문 수정 시 검색 인덱스가 어긋나는 문제를 함께 해결
```

## 백엔드

- `POST /api/archive/corrections` (identifyUser): {idxno, selectedText, suggestion, note?}.
  전자북 대역 검증, 같은 uid+idxno 대기중 5건 초과 차단(스팸 방지).
- `GET /api/archive/corrections/mine` (identifyUser): 내 요청 최근 50건 + 기사 제목 조인.
- `GET /api/admin/corrections?status=` (adminGuard): 요청 목록 + 기사 제목·본문.
- `POST /api/admin/corrections/:id` (adminGuard): {action: accept|reject, adminNote?}. pending만 처리 가능.
- 본문 수정은 **기존** `POST /api/admin/ebook/edit/:idxno` {title?, body} 재사용(저장 시 자동 승인·발췌 갱신).
  FTS는 030의 UPDATE 트리거로 자동 동기화.

파일: `backend/src/archive/corrections.ts`(회원+관리자 라우터), index.ts 마운트
(`/api/archive/corrections`는 archiveRouter보다 먼저 등록).

## 프론트

- 기사 리더(`news/[id]/article-client.tsx`): 전자북 기사 + 회원 상태일 때 "✏️ 수정 요청" 버튼.
  본문 드래그 선택 → 선택 문구 자동 입력 → 제안·사유 입력 → 제출. 제출 후 완료 안내.
- `/admin` 새 탭 "✏️ 수정요청"(`admin/corrections-tab.tsx`): 상태 필터 목록(원문→제안 대비),
  펼치면 본문 편집기 + "제안대로 치환"(유일 일치 시) + 저장 → 승인/반려 + 관리자 메모.
- `/me` "내 수정 요청"(`components/me/my-corrections.tsx`): 상태 배지(검토중/반영됨/반려)와
  관리자 메모. 요청이 없으면 렌더 안 함.

파일: `web/src/lib/api/corrections.ts`(클라이언트).

## 범위 제외 (YAGNI)

Web Push 알림 · 수정 이력 버저닝 테이블 · 최신(외부 원문) 기사 요청.
