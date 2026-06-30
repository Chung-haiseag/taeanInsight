# 주간 AI 팟캐스트 생성기 (로컬·Gemini 멀티스피커)

NotebookLM급 2인 대담 팟캐스트를 **맥(한국 IP)**에서 주 1회 생성해 R2로 올린다.
(Cloudflare Worker는 Gemini API 지역차단 → 한국 IP에서만 생성 가능)

## 흐름
```
D1 최신 발행 리포트 → Gemini 텍스트(2인 대담 대본) → Gemini 멀티스피커 TTS(WAV)
  → R2 audio/podcast/<주차>-gem.wav 업로드 → Worker가 우선 서빙(/reports 팟캐스트)
```

## 1회 설정
```bash
# 1) Gemini 키 등록(둘 중 하나)
echo "여기에_GEMINI_API_KEY" > tools/podcast/.gemini_key && chmod 600 tools/podcast/.gemini_key
#   또는  export GEMINI_API_KEY=...   (디지털화와 동일 키)

# 2) 수동 1회 실행(검증)
sh tools/podcast/run-podcast.sh --force
#   → "✅ 완료" 나오면 /reports 팟캐스트가 NotebookLM급으로 바뀜
```

## 주간 자동화(launchd) — 매주 금 18:00 KST
```bash
cp tools/podcast/com.taean.podcast.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.taean.podcast.plist
launchctl enable gui/$(id -u)/com.taean.podcast
# 즉시 한 번 실행 테스트:
launchctl kickstart -k gui/$(id -u)/com.taean.podcast
tail -f tools/podcast/podcast.log
```
- 리포트 자동발행(금 16:00) 이후라 최신 주차로 생성됨.
- 맥이 꺼져 있으면 다음 부팅 후 실행 안 됨(주간이라 켜져 있을 때 `--force`로 수동 보충 가능).

## 동작 확인
- `/reports` 팟캐스트 → 응답이 `audio/wav`면 Gemini 버전(성공). `audio/mpeg`면 아직 Chirp3-HD(미생성).
- 재생성: `sh tools/podcast/run-podcast.sh --force`

## 비용
- 주 1회 = 월 ~4회. Gemini TTS 유료(후불)지만 양이 적어 **월 약 1,000원**.

## 트러블슈팅
- `GEMINI_API_KEY 필요` → 키 파일/환경변수 확인.
- `User location is not supported` → 한국 IP 아님(VPN/해외). 국내에서 실행.
- 업로드 실패 → `npx wrangler whoami` 로그인 확인.
