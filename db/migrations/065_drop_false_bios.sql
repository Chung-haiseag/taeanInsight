-- 사실표와 어긋나는 AI 인물 소개 캐시 삭제(재생성 유도).
--   '이종일은 8년간 태안군수를 지낸 인물이다' — 옥파 이종일 선생과 뒤섞였다. 문석호·변웅전(국회의원),
--   박풍수·김선주·이용욱도 같은 문장을 달고 있었다(모순 감사 2026-08-28).
--   ⚠ 지우기만 하면 같은 답이 다시 나온다 — people.ts의 contradictsOffice가 생성 뒤 사실표와
--     대조해 어긋나면 내보내지 않는다. 이 삭제는 그 검사를 태우기 위한 것이다.
--   ⚠ '부군수를 지낸'(박경찬·허정회·허재권·김현표·최군일)과 다른 지자체 군수(박정현 부여·김기웅 서천)는
--     정확한 소개라 건드리지 않는다.
DELETE FROM kg_person_bio
WHERE node_id NOT IN (SELECT src_id FROM kg_edges WHERE rel='held')
  AND (bio LIKE '%태안군수를 지낸%' OR bio LIKE '%태안군수를 역임%'
       OR bio LIKE '%태안군수였%' OR bio LIKE '%태안군수이다%')
  AND bio NOT LIKE '%부군수%';
