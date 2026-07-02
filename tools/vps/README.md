# 태안 크롤러 — 기존 VPS(카페24 등) 공존 배포

맥 의존을 없애고, **한국 IP가 필요한 4개 작업**을 기존 리눅스 VPS(echotwin 등)에 **나란히** 올린다.
`taean-` 네임스페이스라 다른 프로젝트와 충돌하지 않는다.

## 옮기는 대상 (한국 IP 필수)
| 작업 | 주기 | 이유 |
|---|---|---|
| 군청 수집 | 6시간 | 군청 해외 IP 차단 |
| 도로 CCTV | 30분 | ITS 9443 포트 |
| 주간 팟캐스트(Gemini) | 금 18:00 | Gemini 지역차단 |
| 주요 기사 낭독(Gemini) | 매일 07:00 | Gemini 지역차단 |

> data.go.kr(날씨·해양·실거래·관광)·네이버 클리핑은 **Cloudflare에서 이미 동작** → 옮기지 않음.

## 전제
- **가상서버(VPS, root/sudo)** — 카페24 "가상서버 호스팅" 등. (공유 웹호스팅 ❌)
- Node 18+ · poppler-utils(설치 스크립트가 처리) · git

## 설치
```bash
# 1) VPS에 저장소 클론(원하는 위치)
git clone <이 저장소> taean && cd taean

# 2) 공존 설치(taean- 유닛만 추가, 기존 프로젝트 영향 없음)
sudo bash tools/vps/install.sh

# 3) 키 입력
sudo nano /etc/taean.env
#   TAEAN_GOV_TOKEN, ITS_API_KEY (군청·CCTV)
#   GEMINI_API_KEY (팟캐스트·기사낭독)
#   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID (D1 조회·R2 업로드용)

# 4) 타이머 재시작 + 즉시 검증
sudo systemctl restart taean-*.timer
sudo systemctl start taean-gov.service && journalctl -u taean-gov.service -n 20 --no-pager
```

## Cloudflare API 토큰 (팟캐스트·기사낭독용)
팟캐스트·기사낭독은 D1 조회 + R2 업로드에 wrangler를 쓴다. 헤드리스 VPS에선 **API 토큰**으로 인증:
1. Cloudflare 대시보드 → My Profile → **API Tokens → Create Token**
2. 권한: **D1 Read**, **Workers R2 Storage Edit**
3. 발급된 토큰 → `CLOUDFLARE_API_TOKEN`, 계정 ID → `CLOUDFLARE_ACCOUNT_ID` 에 입력
- 기사낭독 여러 키 로테이션: `tools/news-audio/.gemini_keys`(줄당 1키)를 VPS에도 두면 사용.

## 시간대
타이머 시각(18:00·07:00)은 **VPS 시스템 시간대 기준**. KST가 아니면:
```bash
sudo timedatectl set-timezone Asia/Seoul
```

## 공존 확인 / 정리
- 상태: `systemctl list-timers | grep taean`
- 로그: `journalctl -u taean-newsaudio.service -f`
- 제거(태안만): `sudo systemctl disable --now taean-*.timer && sudo rm /etc/systemd/system/taean-*`

## 맥(launchd) 정리 — VPS 검증 후
```bash
for j in com.taean.govingest com.taean.cctv com.taean.podcast com.taean.newsaudio; do
  launchctl bootout gui/$(id -u)/$j 2>/dev/null || true
done
```
