-- 언급 누락 61건 백필 + 조각 근거 소속 24건 삭제 (정합성 점검 2026-09-01).
--
-- 무엇이 어긋났나: `belongs_to`가 근거로 든 기사가 그 사람의 **등장 기사 목록에 없었다**(89건).
--   화면의 '등장 N건'이 실제보다 적게 세어지고, 근거로 든 기사로 갈 수도 없다.
--
-- 원인: 인물 언급은 **Gemini가 본문을 읽고** 뽑고(`tools/kg/extract-persons.mjs`),
--   소속은 **규칙(정규식)**으로 뽑는다. 둘이 어긋난 것이다. 89건 중 87건은 그 기사가
--   이미 처리돼 다른 인물 언급이 붙어 있었다 — 즉 미처리가 아니라 **그 이름만 놓친** 것이다.
--
-- ⚠ 그런데 89건은 한 종류가 아니었다. 근거 문장을 하나씩 읽어 보니 **절반 가까이가
--   애초에 사람이 아니었다** — '자생력 강화 위한', '23일 기준 군수 후보', '군의원 정수 8명',
--   '기호를 정한 태안군의원', '왕따 주장 군의원', '군청 지하 교육장', '자리 하나씩', '한국서부발전'.
--   **Gemini가 맞고 규칙이 틀렸다.** 여기에 언급을 채워 넣었으면 없는 사람을 더 진짜처럼 만들었다.
--   그래서 진짜 사람 61건만 채우고, 조각 근거 소속 24건은 지운다.
--
-- ⚠ 노드는 지우지 않는다. 그 이름의 **다른** 언급을 전부 열어 보니 진짜인 것이 섞여 있었다 —
--   강화(요가 강사), 기준(箕準·고조선 준왕), 한국(韓國·고려 무신), 오창(의용소방연합회장·9건),
--   김수·정수·이기(명단·기사 속 실명), 이신(당 시인 李紳), 최부(조선 문신 崔溥), 가상(명 장수 賈祥).
--   근거 한 줄만 보고 조각이라 단정하면 사람을 지운다. 틀린 것은 소속뿐이다.

-- ① 진짜 사람인데 빠져 있던 언급 61건. 이름이 본문에 실제로 있음을 확인했다(INSTR>0, 광고 아님).
INSERT OR IGNORE INTO kg_mentions (node_id, article_idxno, schema_ver, created_at) VALUES
 ('person:가기영',48406,1,datetime('now')),
 ('person:가세로',40454,1,datetime('now')),
 ('person:가창현',21879,1,datetime('now')),
 ('person:고종남',33220,1,datetime('now')),
 ('person:고현정',68815,1,datetime('now')),
 ('person:구승회',42536,1,datetime('now')),
 ('person:국중락',90007664,1,datetime('now')),
 ('person:국중락',90007942,1,datetime('now')),
 ('person:국중락',90008051,1,datetime('now')),
 ('person:국현민',52632,1,datetime('now')),
 ('person:국현민',52677,1,datetime('now')),
 ('person:권오창',90003240,1,datetime('now')),
 ('person:김기만',48406,1,datetime('now')),
 ('person:김남용',42536,1,datetime('now')),
 ('person:김순환',90008244,1,datetime('now')),
 ('person:김영호',90028172,1,datetime('now')),
 ('person:김은미',48406,1,datetime('now')),
 ('person:김은배',48406,1,datetime('now')),
 ('person:김은배',61638,1,datetime('now')),
 ('person:김의경',90005241,1,datetime('now')),
 ('person:김진권',68006,1,datetime('now')),
 ('person:김진묵',4095,1,datetime('now')),
 ('person:맹천호',42536,1,datetime('now')),
 ('person:문용현',42536,1,datetime('now')),
 ('person:문제동',90000584,1,datetime('now')),
 ('person:박동규',55245,1,datetime('now')),
 ('person:박선의',54657,1,datetime('now')),
 ('person:박선의',55443,1,datetime('now')),
 ('person:박승기',42274,1,datetime('now')),
 ('person:백정흠',805,1,datetime('now')),
 ('person:신명순',42536,1,datetime('now')),
 ('person:양광모',68844,1,datetime('now')),
 ('person:양광모',68847,1,datetime('now')),
 ('person:엄경일',47915,1,datetime('now')),
 ('person:이기재',18335,1,datetime('now')),
 ('person:이만선',90000265,1,datetime('now')),
 ('person:이만선',90000376,1,datetime('now')),
 ('person:이민영',38688,1,datetime('now')),
 ('person:이상무',2528,1,datetime('now')),
 ('person:이성종',42536,1,datetime('now')),
 ('person:이한규',42536,1,datetime('now')),
 ('person:이현태',42536,1,datetime('now')),
 ('person:임재수',42536,1,datetime('now')),
 ('person:장경후',48406,1,datetime('now')),
 ('person:장경희',42536,1,datetime('now')),
 ('person:장경희',48406,1,datetime('now')),
 ('person:장영수',43068,1,datetime('now')),
 ('person:전강석',42536,1,datetime('now')),
 ('person:정광섭',6960,1,datetime('now')),
 ('person:조규호',48406,1,datetime('now')),
 ('person:조상호',48406,1,datetime('now')),
 ('person:조상호',53952,1,datetime('now')),
 ('person:조재오',42536,1,datetime('now')),
 ('person:조재오',48406,1,datetime('now')),
 ('person:조재오',57570,1,datetime('now')),
 ('person:지안근',62491,1,datetime('now')),
 ('person:진태구',90000493,1,datetime('now')),
 ('person:최병구',42536,1,datetime('now')),
 ('person:최진환',90009774,1,datetime('now')),
 ('person:한상학',90013484,1,datetime('now')),
 ('person:한석민',48406,1,datetime('now'));

-- ② 조각 근거로 만들어진 소속 24건 삭제. 근거 문장이 전부 문장 조각·잘린 이름이다.
--   (김아무개·문아무개는 익명 표기라 애초에 소속을 가질 수 없다)
DELETE FROM kg_edges WHERE rel='belongs_to' AND src_id IN (
  'person:가상', 'person:강화', 'person:고남', 'person:권오', 'person:기준', 'person:김수', 'person:김순', 'person:김아무개', 'person:문아무개', 'person:박사장', 'person:오창', 'person:유의원', 'person:윤형', 'person:이기', 'person:이신', 'person:이용한', 'person:정수', 'person:정한', 'person:주장', 'person:지하', 'person:최부', 'person:하나', 'person:한국', 'person:홍주'
);

-- ── 되돌리기 ────────────────────────────────────────────────────────────────
-- ① DELETE FROM kg_mentions WHERE created_at >= '<이 마이그레이션 실행 시각>' ;  (또는 위 목록 그대로 삭제)
-- ② 삭제한 소속은 backups-fragment-affiliations-20260901.json 참조.
