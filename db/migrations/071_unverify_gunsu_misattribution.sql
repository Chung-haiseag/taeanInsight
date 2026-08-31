-- '태안군청 군수' 오귀속 57건 검증 해제 (정합성 점검 2026-08-31).
--
-- 무엇이 어긋났나: `belongs_to`가 '태안군청 · 군수'라고 검증해 둔 사람 58명 중,
--   공식 군수 명부(`held` → office:taean-gunsu)에 있는 사람은 하나도 없었다.
--   태안군수는 한 번에 한 사람이고 명부는 1대(1989)부터 빠짐없이 채워져 있다.
--   58건 근거를 하나씩 눈으로 읽어 갈래를 나눴다.
--
--   ① 다른 지자체 군수 — 김시환(청양)·나소열(서천)·이종건(홍성)·최승우(당진 민선4기)
--      ·이민영/이민녕(서산군지 저자)·김두관(남해)·박정현(부여)·장영수(장수)·김태호·김항곤
--      ·박정기(서산)·정기호·이익창·이종근. 문장에 지역이 안 적힌 것도 많다(알려진 한계).
--   ② 후보를 재임으로 — 이영수('태안군수 예비후보')·김관섭('입후보예정자'·'공천신청').
--      추출 규칙의 구멍이었고 같은 커밋에서 막았다(예비후보·공천신청 추가).
--   ③ 문장 조각이 사람이 된 것 — 권한('군수 권한 대행')·전용('군수 전용 관사')
--      ·장인('자치단체의 장인 군수')·가진('사고를 가진 군수')·이신('군수이신 체육회장')
--      ·남을('승자로 남을 군수')·이용한('차량을 이용한 군수')·가상('군수 가상 대결').
--   ④ OCR 오독 이름 — 류읍상·류근상·류응랑·류운산·류웅상·류선상·류홍상·류근창·류응사(=류응상)
--      ·권오(=권오창)·윤영상(=윤형상)·송선헌(=송성헌)·기세로/가세(=가세로)·진태수(=진태구).
--      직함은 맞지만 그런 이름의 사람이 없다.
--
-- ⚠ 남기는 것 — 유응상. 2대 군수 본인이다. db/064가 신문 표기 '류응상' 쪽에 `held`를 달아
--   명부 표기 '유응상'에는 직위가 없을 뿐, 소속 '태안군청 군수'는 사실이다.
--
-- ⚠ 함께 내리지만 **사실은 태안군수가 맞는** 세 사람 — 김완지(세종 21년·1439 복군 때 부임)
--   ·신백희(1894 동학 당시)·이기석(1902). 태안군청은 1989년 신설 기관이라 이들을 그 소속으로
--   적는 것은 시대착오이고, 화면에는 기사가 쓰인 해(2004~2005 등)가 붙어 재임 시기로 오해된다.
--   조선·대한제국 군수 계보는 `office:taean-gunsu`(1대=1989)와 별개라 여기서 만들지 않는다.
--   제대로 살리려면 별도 office 노드가 필요하다 — 후속 과제로 남긴다.
--
-- 되돌리기 쉽게 **삭제가 아니라 verified=0**으로 내린다. 어드민 검수 목록에 남는다.

UPDATE kg_edges SET verified = 0, updated_at = datetime('now')
WHERE rel = 'belongs_to'
  AND verified = 1
  AND dst_id = 'org:taean-gov'
  AND json_extract(attrs_json, '$.role') LIKE '%군수%'
  AND json_extract(attrs_json, '$.role') NOT LIKE '%부군수%'
  AND src_id <> 'person:유응상'
  AND NOT EXISTS (
    SELECT 1 FROM kg_edges h
    WHERE h.src_id = kg_edges.src_id AND h.rel = 'held' AND h.dst_id = 'office:taean-gunsu'
  );

-- ── 되돌리기 ────────────────────────────────────────────────────────────────
-- UPDATE kg_edges SET verified = 1, updated_at = datetime('now')
-- WHERE rel='belongs_to' AND verified=0 AND dst_id='org:taean-gov'
--   AND json_extract(attrs_json,'$.role') LIKE '%군수%'
--   AND json_extract(attrs_json,'$.role') NOT LIKE '%부군수%'
--   AND NOT EXISTS (SELECT 1 FROM kg_edges h WHERE h.src_id=kg_edges.src_id AND h.rel='held' AND h.dst_id='office:taean-gunsu');
