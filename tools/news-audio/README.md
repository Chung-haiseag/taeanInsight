# 주요 기사 Gemini 낭독 생성기 (로컬·무료 키 로테이션)

주요 기사를 **팟캐스트급 Gemini 음성**으로 낭독 생성해 R2에 올린다. **비용 0**(무료 키 2개 로테이션).
(Worker는 Gemini 지역차단 → 한국 IP 맥에서 생성)

## 구조
```
맥(한국 IP·매일) → 최근 주요 기사 N건 Gemini 낭독(무료 키 victory·holyroad 로테이션)
  → R2 audio/news/<idxno>-gem.wav 업로드
Worker → -gem.wav 있으면 그걸(Gemini 자연 음성), 없으면 Chirp3-HD(무료 폴백)
```
- 무료 키 **키당 ~15건/일** → 2개면 **~30건/일 무료**. 소진되면 자동 중단(나머지는 Chirp3-HD).

## 1회 설정
```bash
# 무료 등급 키 2개를 한 줄에 하나씩(순서 무관)
cat > tools/news-audio/.gemini_keys <<'KEYS'
victory_무료키_값
holyroad_무료키_값
KEYS
chmod 600 tools/news-audio/.gemini_keys

# 수동 실행(검증)
sh tools/news-audio/run-news-audio.sh --max=30
```

## 옵션
- `--max=N` : 최대 N건(기본 30)
- `--force` : 이미 있는 것도 재생성
- `PER_KEY=15` : 키당 하루 안전 상한(기본 15, 유료 전환 방지)

## 매일 자동화(launchd) — 07:00 KST
```bash
cp tools/news-audio/com.taean.newsaudio.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.taean.newsaudio.plist
launchctl enable gui/$(id -u)/com.taean.newsaudio
launchctl kickstart -k gui/$(id -u)/com.taean.newsaudio   # 즉시 1회
tail -f tools/news-audio/news-audio.log
```

## 확인
- 기사 상세 🔊 → 응답 `audio/wav`면 Gemini(성공), `audio/mpeg`면 Chirp3-HD(폴백).
- 로그의 "키사용 15/9" 처럼 키별 사용량 표시.

## 비용
- 무료 키만 쓰면 **₩0**. 한도 초과분은 Chirp3-HD(무료)로 자동 처리 → 유료 전환 없음.
- (원하면 유료 키를 .gemini_keys 마지막 줄에 추가해 초과분도 Gemini로 — 기사당 ~50~130원)
