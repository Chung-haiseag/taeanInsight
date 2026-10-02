-- 순차 수집(sweep)이 넣은 21건의 섹션 표기를 백필본과 맞춘다 (2026-09-17).
--
-- 왜: 신문 메타는 '농&amp;#12539;어업'처럼 이중 인코딩돼 있고, 백필 도구는 &amp;만 풀어
--   '농&#12539;어업'(2,273건)으로 저장했다. sweep 첫 판은 아무것도 풀지 않아 같은 섹션이
--   '뉴스>농&amp;#12539;어업'(21건)으로 갈렸다. 코드는 고쳤고(sweep.ts parseArticleMeta), 이미 들어온 21건만 맞춘다.
-- ⚠ 숫자 엔티티(&#12539;)까지 풀어 '농·어업'으로 만들지 않는다 — 그러면 2,273건과 또 갈린다.
--   전체를 '농·어업'으로 통일하는 것은 별건(표시 계층에서 풀거나, 2,294건 일괄 UPDATE + 필터 값 확인).

UPDATE archive_articles
   SET section = replace(section, '&amp;#', '&#')
 WHERE section LIKE '%&amp;#%';

-- ── 되돌리기 ────────────────────────────────────────────────────────────────
-- 되돌릴 이유가 없다(이전 값이 오타). 굳이 필요하면 sweep이 넣은 행(idxno 68301~69300, section<>'RSS')만
-- UPDATE archive_articles SET section=replace(section,'&#','&amp;#') WHERE idxno BETWEEN 68301 AND 69300 AND section LIKE '%&#12539;%';
