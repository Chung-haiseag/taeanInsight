-- 전자북(과거지면) 디지털화 검수 — 신문사 관리자가 원본 지면과 대조해 승인/반려
-- verify_status: NULL=미검수 | 'approved'(승인) | 'flagged'(수정필요)
-- faithfulness: 파이프라인이 산출한 OCR 대비 본문 충실도(0~1) — 검수 우선순위 정렬용
ALTER TABLE archive_articles ADD COLUMN verify_status TEXT;
ALTER TABLE archive_articles ADD COLUMN verify_note TEXT;
ALTER TABLE archive_articles ADD COLUMN verified_at TEXT;
ALTER TABLE archive_articles ADD COLUMN faithfulness REAL;
