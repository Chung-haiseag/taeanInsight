-- 오귀속 소속 1건 검증 해제.
--   김순환은 태안군의회 **의장**인데 'e:belongs:김순환__org:taean-gov'가 직함 '군수'로 붙어 있었다.
--   근거는 "이종은 군수 김순환 의장을 비롯한…" — **앞사람의 직함**이 뒷사람에게 걸렸다.
--   지우지 않고 verified=0으로 내려 화면에서만 빠지게 한다(어드민 검수 대기로 돌아간다).
UPDATE kg_edges SET verified = 0, updated_at = datetime('now')
WHERE id = 'e:belongs:김순환__org:taean-gov';
