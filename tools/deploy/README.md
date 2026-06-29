# 크롤러 클라우드 이전 — 한국 IP VM 배포

군청·도로 CCTV 수집기를 **맥 대신 한국-IP Linux VM**에서 24/7 자동 실행한다.
(나머지 데이터는 Cloudflare Worker가 처리 — 이 둘만 한국 IP가 필요: 군청 해외IP 차단·ITS 9443포트)

## 왜 한국 IP 클라우드인가
- **군청(taean.go.kr)**: 해외 데이터센터 IP 차단 → Cloudflare Worker로 못 닿음
- **ITS(openapi.its.go.kr:9443)**: Worker가 9443 포트 못 닿음
- → 한국 가정/클라우드 IP에서 받아 Worker로 적재(D1/R2)

## 추천 VM — Oracle Cloud Free Tier (서울, ₩0 영구)
1. oracle.com/cloud/free 가입(카드 본인확인, **과금 안 됨**)
2. 인스턴스 생성 — 리전 **Seoul(ap-seoul-1)** 또는 Chuncheon, 이미지 **Ubuntu 22.04**, Shape **Always Free**(VM.Standard.E2.1.Micro 또는 Ampere)
3. SSH 키 등록 → 공인 IP 발급 → `ssh ubuntu@<공인IP>`
   - 아웃바운드만 쓰므로 **방화벽 인바운드 추가 불필요**

## 설치 (VM 안에서)
```bash
# 1) 코드 가져오기
sudo apt-get update -y && sudo apt-get install -y git
git clone <이 저장소 URL> taean && cd taean

# 2) 설치 스크립트
sudo bash tools/deploy/install.sh

# 3) 시크릿 입력 (Worker 값과 동일)
sudo nano /etc/taean-crawler.env
#   TAEAN_GOV_TOKEN=<Worker GOV_IMPORT_TOKEN 과 동일>
#   ITS_API_KEY=<ITS 인증키>

# 4) 타이머 재시작 + 즉시 1회 실행 확인
sudo systemctl restart taean-gov.timer taean-cctv.timer
sudo systemctl start taean-gov.service  && journalctl -u taean-gov.service  -n 30 --no-pager
sudo systemctl start taean-cctv.service && journalctl -u taean-cctv.service -n 30 --no-pager
```

## 동작 확인
- 군청: 6시간마다 / CCTV: 30분마다 자동
- `systemctl list-timers | grep taean` 로 다음 실행시각 확인
- 적재 확인: 사이트 `/live`(CCTV)·`/news`·리포트 군정소식 갱신, 또는
  `curl https://taean-insight-api.chs9182.workers.dev/api/conditions/cctv` 등

## 맥(launchd) 정리 (이전 완료 후)
VM에서 정상 동작 확인되면 맥의 기존 잡 제거:
```bash
launchctl bootout gui/$(id -u)/com.taean.govingest 2>/dev/null || true
launchctl bootout gui/$(id -u)/com.taean.cctv 2>/dev/null || true
```

## 트러블슈팅
- `pdftotext 없음` → `sudo apt-get install -y poppler-utils`
- 군청 403/차단 → VM 리전이 한국인지 확인(서울/춘천)
- 적재 401 → `TAEAN_GOV_TOKEN` 이 Worker `GOV_IMPORT_TOKEN` 과 다름
- 로그: `journalctl -u taean-gov.service -f`
