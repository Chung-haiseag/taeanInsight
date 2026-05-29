# PRD: 태안 AI 인텔리전스 커먼즈 플랫폼 (Taean AI Intelligence Commons Platform)

**작성자:** 태안신문 디지털전환 TF · 주관사 (주)엔씨투
**버전:** 1.9 (2026-05-29 예산 재배분 — AI Core·플랫폼 강화 / 시민기자·마케팅 축소)
**최종 수정일:** 2026-05-29
**상태:** **Approved** (모든 핵심 의사결정 완료)
**핵심 결정사항 (2026-05-26 ~ 27):**
- LLM: Phase 1 벤치마크로 결정 — **온프레미스 모델 + API 모델 동시 비교**
- **GPU 인프라: Hybrid (Anthropic Batch API + Together AI Solar Mini)** — 자체 PC 결정 철회 (v1.1 → v1.2)
- 결제 PG: 토스페이먼츠
- B2B 가격: 기본 30,000원 / 프리미엄 80,000원 (저가 진입) → 영업 목표 상향 필요
- **예산 재배분 (v1.3):** GPU 구매 절감 400만원 → AI Core Engine +200만 / 평가셋 강화 +100만 / 베타 인센티브 +100만
- **KPI 재정의 (v1.4):** "유료 고객 120개" 목표 → Phase 3 베타 종료 시점(2026-11)에 실측 전환율·ARPU 데이터 기반 재결정
- **시민기자 정산 (v1.4):** 월간 정산 (매월 말 자동 집계·이체)
- **민감 주제 차단 (v1.4):** 기본 4종(선거·범죄·의료·종교) + 확장 3종(정치적 인물·부동산 투기 자문·소수자 이슈)
- **시민기자 일정 재조정 (v1.5):** 모집·선발을 사업계획서 원안 5월(M1)에서 **7월 중순**으로 연기 → 교육 7월 말~8월, 활동 9~11월(3개월). 발행량 목표 1인당 월 4~6편 × 3개월 = **12~18편/인** (원안 16~24편 대비 감소). 시민기자 관련 사전 준비 작업은 6월 말까지 완료해야 함
- **프론트엔드 배포 (v1.6 → v1.7 보강):** **Cloudflare Workers + Static Assets** 확정 (`@opennextjs/cloudflare` 어댑터). 무제한 무료 트래픽으로 사업 운영비(월 30만원 목표) 정합성 최상. SSL 자동 발급, 글로벌 Cloudflare CDN. 라이브: `taean-insight.chs9182.workers.dev`
- **초개인화 페이지 + B2G 세그먼트 (v1.7):** 모든 승인 회원(B2C·B2B·**B2G**)에게 `insight.taeannews.co.kr` 내 **초개인화 페이지(`/me`)** 제공. 사용자가 직접 선택한 관심 지역(읍·면)·관심 분야(관광·환경·부동산·정책)·즐겨찾기 기반 맞춤 콘텐츠·알림. B2G(군청·읍면사무소·교육청·공공기관)는 신규 세그먼트로 정식 등록, 가격·기능은 Phase 3 베타 후 확정
- **초개인화 상세 설계 (v1.8):**
  - **(1) 첫 화면 톤**: 세그먼트별 자동 전환 — B2C는 "환영" 톤(따뜻한 메시지·즐겨찾기·다음 주말 미리보기), B2B·B2G는 "도구" 톤(대시보드·숫자·차트). B2C Premium은 상단 토글로 두 톤 전환 가능
  - **(2) 개인화 깊이**: **v1.0은 L1(명시적 선택)만** — 사용자가 직접 입력한 관심 지역·분야·즐겨찾기 기반. L2(행동 학습 추천)는 2027 로드맵, L3(AI 임베딩 예측)는 2028+ 검토. **이유**: 캐싱 75% 유지(운영비 30만원 보호) + 프라이버시 단순화
  - **(3) 세그먼트 차이**: 단일 `/me` 라우트 + **위젯 가시성 제어** 방식 — 세그먼트에 따라 위젯 켜고/꺼짐. 모바일 기본 정렬만 세그먼트별 다르게
  - **(4) 콘텐츠 등급 분류**: 모든 발행물을 3등급으로 분류
    - **Critical (공동체 필수)**: 적조·태풍·대형 사고 등 — **관심사 무관 모든 사용자에게 노출** (필터 버블 방지, 지역신문 정체성 보호)
    - **Community (공동체 권장)**: 군수 인터뷰·군의회 의결 등 — 관심 분야 아니어도 작게 노출
    - **Personal (개인 맞춤)**: 안면도 펜션 추천·미세먼지 예보 등 — 관심사 일치 시만 노출
    - 등급은 편집부·시민기자가 발행 시 선택, AI 보조 분류 가능 (HITL 검토 단계에서 확정)
- **예산 재배분 (v1.9, 2026-05-29):** AI Core Engine +150만(→1,900만 / 38%) 및 플랫폼·Hybrid +150만(→1,400만 / 28%)으로 보강. Citizen Co-Pilot & 교육 −150만(→550만 / 11%, 활동 3개월 단축 반영) 및 마케팅·B2B 영업 −150만(→550만 / 11%, 캠페인 규모 재조정)에서 차감. 데이터·인프라 300만, PM·Contingency 300만 유지. 총 5,000만원·9장 표 정합
**TaskMaster 최적화:** Yes
**원본 자료:** `태안신문_2026_사업계획서.pdf` (지역신문발전위원회 사업계획서)
**사업명:** 태안 AI 인텔리전스 커먼즈 플랫폼 구축 사업
**사업기간:** 2026-05-18 ~ 2026-12-15 (7개월)
**총 사업비:** 50,000,000원 (보조금 45M · 자부담 5M)

---

## 목차

1. [개요](#1-개요-executive-summary)
2. [문제 진술](#2-문제-진술-problem-statement)
3. [목표 & 성공 지표](#3-목표--성공-지표-goals--success-metrics)
4. [대상 사용자](#4-대상-사용자-target-users)
5. [사용자 스토리](#5-사용자-스토리-user-stories)
6. [기능적 요구사항](#6-기능적-요구사항-functional-requirements)
7. [비기능적 요구사항](#7-비기능적-요구사항-non-functional-requirements)
8. [기술 고려사항](#8-기술-고려사항-technical-considerations)
9. [구현 로드맵](#9-구현-로드맵-implementation-roadmap)
10. [범위 외](#10-범위-외-out-of-scope)
11. [경쟁 분석](#11-경쟁-분석-competitive-analysis)
12. [미해결 질문 & 리스크](#12-미해결-질문--리스크-open-questions--risks)
13. [릴리즈 기준](#13-릴리즈-기준-release-criteria)
14. [검증 체크포인트](#14-검증-체크포인트-validation-checkpoints)
15. [실무자 관점 Q&A](#15-실무자-관점-qa-practitioners-perspective-qa)
16. [사용자 관점 Q&A](#16-사용자-관점-qa-users-perspective-qa)
17. [부록: 태스크 분해 힌트](#17-부록-태스크-분해-힌트-appendix-task-breakdown-hints)

---

## 1. 개요 (Executive Summary)

태안군의 지역 언론은 관광·환경·부동산 분야에서 급증하는 예측 정보 수요에 직면해 있으나, 실시간 Multi-Agent 기반 상용 LLM 운영 비용(월 100만원 이상)이 지속가능성을 가로막고 있습니다. 본 사업은 **캐싱 우선·배치 처리·Quantized Self-host**의 3축 비용 최적화 전략을 적용한 LangGraph Lite 기반 경량 AI 플랫폼(`insight.taeannews.co.kr`)을 구축하여, 기존 커뮤니티 허브(`taeannews.co.kr`)와 Hybrid 연동합니다. 2026년 12월까지 **월 AI 운영비 30만원 이내**, **MRR 1,500만원**, **유료 고객 120개**, **MAU 12,000명**을 달성하여 충남 서해안형 지역 AI 저널리즘의 표준 모델을 정립합니다.

---

## 2. 문제 진술 (Problem Statement)

### 2.1 현재 상황

- 태안군은 연간 1,500만 명+ 관광객, 5.9만 주민(고령자 39.7%), 가로림만 등 광역 해양환경을 보유한 충남 서해안 핵심 지역으로, 관광·환경·부동산 분야의 실시간·예측 데이터 수요가 폭증하고 있다.
- 기존 `taeannews.co.kr`은 무료 뉴스·커뮤니티 허브로 운영되며, AI 기반 부가가치 서비스가 부재하다.
- 상용 LLM(GPT-4, Claude 등)과 실시간 Multi-Agent 구조를 그대로 도입하면 **월 100만원 이상**의 AI 운영비가 발생하여, 지역신문의 매출 규모로는 지속운영이 불가능하다.
- 평택시민신문·당진시대신문 등 유사 지역신문의 디지털 전환 사례에서도 비용 통제 실패로 인한 서비스 중단 위험이 반복적으로 확인된다.

### 2.2 사용자 영향

- **영향 받는 대상:**
  - **B2C 독자** (관광객·이주민·귀촌인·지역민): 약 12,000명 MAU 목표 (현재 무료 사이트 방문자 기반 추정)
  - **B2B 고객** (지역 기업·관광사업체·공공기관): 약 120개 목표
  - **시민기자 12명**: AI 도구 부재로 콘텐츠 생산성 정체
- **영향 방식:**
  - 의사결정에 필요한 관광 변동·해양환경·부동산 예측 데이터를 일일이 여러 사이트에서 직접 수집해야 함
  - 지역 특화 정보가 부족해 외지 투자자·이주민은 비공식 채널(부동산 카페, 블로그)에 의존
  - 시민기자는 사실확인·자료조사에 1편당 4~6시간 소요로 월간 발행량 한계
- **심각도:** **High** — 데이터 수요 급증 대비 공급 부재로 정보 비대칭과 지역 의사결정 품질 저하를 초래

### 2.3 비즈니스 영향

- **문제의 비용:**
  - 상용 LLM 도입 시 월 100만원 운영비 → 연 1,200만원 (지역신문 수익 대비 비현실적)
  - 예측 인사이트 부재로 잠재 B2B 매출(관광·환경 컨설팅 수요) 기회 손실 추정 연 5,000만원+
- **기회 비용:** AI 전환을 지연하면 충남 서부의 디지털 저널리즘 주도권을 인근 도시(서산·당진)에 빼앗길 위험
- **전략적 중요성:**
  - 지역신문발전법 입법 취지(지역 다양성·풀뿌리 저널리즘) 부합
  - UN SDG 9(산업·혁신), SDG 11(지속가능 도시), SDG 17(파트너십) 목표 정렬
  - 2030년 충남 서해안 AI Hub 확장 비전의 출발점

### 2.4 왜 지금 해결해야 하는가?

- 2026년 오픈소스 Quantized 모델(Solar-10.7B, Llama-3.1-8B/14B)이 한국어 추론 품질에서 상용 모델 수준에 근접해 **저비용 Self-hosting의 기술적 임계점**에 도달
- 지역신문발전위원회의 2026년 보조사업 일정(5월 착수)에 맞춰 자금 확보 가능
- 태안군의 관광·부동산 수요가 2024~2025년 연속 상승세로 시장 시그널 명확
- (주)엔씨투의 20년 접근성 SW 전문성과 한국시각장애인연합회 등 공공기관 협력 실적으로 즉시 수행 가능한 컨소시엄 역량 확보

---

## 3. 목표 & 성공 지표 (Goals & Success Metrics)

### 목표 1: 저비용·지속가능 AI 운영 체제 구축
- **설명:** 상용 LLM 의존을 제거하고 자체 호스팅 경량 모델로 매월 운영비를 통제
- **지표:** 월 AI 운영비 (LLM 추론 + 인프라 + 외부 API)
- **기준선:** 상용 Multi-Agent 구조 기준 월 100만원+ (산출 근거: 사업계획서 02 필요성 및 배경)
- **목표:** **≤ 300,000원/월**
- **기간:** 2026-12-15 정식 런칭 시점
- **측정 방법:** 비용 모니터링 대시보드 (LLM API/시간당 GPU/스토리지 분리 계측), 매주 자동 보고

### 목표 2: 월 반복 수익(MRR) 확보로 사업 자립
- **설명:** 보조금 종료 이후 자립 가능한 매출 구조 확보
- **지표:** MRR(월 반복 수익) = B2C 구독 + B2B 라이선스 + 데이터·광고
- **기준선:** 0원 (신규 사업)
- **목표:** **15,000,000원/월** (2026-12 기준)
- **세부 구성 (2026-05-26 가격 확정):**
  - B2C Premium 구독 (월 약 15,000원): 4,500,000원 (30%) → 300명
  - B2C Basic 구독 (월 약 5,000원): 2,700,000원 (18%) → 540명
  - **B2B 기본 대시보드 (월 30,000원 — 저가 진입): 3,600,000원 (24%) → 120개**
  - **B2B 프리미엄 (월 80,000원 — 저가 진입): 2,400,000원 (16%) → 30개**
  - 데이터·API 판매: 1,200,000원 (8%)
  - 광고·후원·기업 협찬: 600,000원 (4%)
- **⚠️ 가격 정책 영향:** 저가 진입 결정으로 **B2B 유료 150개 + B2C 840개 = 총 990개 활성 결제자** 필요 → 사업계획서 "유료 고객 120개" 지표는 **가중치 적용 정의 재검토 필요** (예: B2B 1개 = 5점, B2C 1개 = 1점 등). §12 Q5에 신규 리스크 추가.
- **기간:** 2026-12-15
- **측정 방법:** 결제 시스템(PG) 트랜잭션 로그 + B2B 계약 관리 시트 + Google Analytics 유료 전환 이벤트

### 목표 3: 유료 고객 120개·MAU 12,000명 달성
- **설명:** 안정적 수요 기반과 유료 전환 퍼널 구축
- **지표:** 유료 고객 수(중복 제외), MAU(월간 활성 사용자), Churn Rate
- **기준선:** 유료 0개, MAU 0명 (기존 `taeannews.co.kr` 트래픽은 별도)
- **목표:**
  - 유료 고객 **120개** (B2C 100 + B2B 20 가중)
  - MAU **12,000명**
  - Churn Rate **≤ 13%** (월간)
- **기간:** 2026-12-15
- **측정 방법:** Google Analytics 4 + 자체 사용자 DB + 매월 코호트 분석

### 목표 4: AI 콘텐츠 신뢰성·운영 효율 동시 달성
- **설명:** AI 생성/보조 콘텐츠 비율을 의미 있게 확보하면서 HITL 검토로 품질 보증
- **지표:** AI 콘텐츠 비율(전체 기사 중 AI 보조), 캐싱 히트율, HITL 검증 비율
- **기준선:** AI 콘텐츠 0%, 캐싱 0% (신규)
- **목표:**
  - AI 콘텐츠 비율 **42%**
  - 캐싱 히트율 **≥ 75%**
  - HITL 검증 비율 **100%** ([AI 보조] 라벨 부착)
- **기간:** 2026-12-15
- **측정 방법:** CMS 메타데이터 태깅, Redis 캐시 통계, 에디터 검토 로그

---

## 4. 대상 사용자 (Target Users)

### 4.1 주요 사용자 그룹

| 사용자 그룹 | 특성 | 주요 니즈 | 사용 빈도 | 예상 규모 |
|------------|------|---------|---------|---------|
| **관광객·잠재 방문자** | 외부 거주, 만리포·천리포·안면도 방문 계획 | 기상·관광객 변동 예측, 맛집·해넘이 정보 | 계절성, 월 1~3회 | MAU 4,500명 |
| **이주민·귀촌 검토자** | 30~50대, 외지 거주, 부동산·정착 조사 | 토지거래·시세·정주 여건 분석 | 월 2~4회 | MAU 1,500명 |
| **태안군 거주민 (일반)** | 5.9만 인구, 고령자 39.7% | 지역 뉴스, 생활 정보, 환경 알림 | 주 2~5회 | MAU 5,000명 |
| **B2B 관광사업체·소상공인** | 펜션·식당·체험업체 | 관광객 예측 대시보드, 광고 집행, **내 상권 초개인화 페이지** | 주 1~3회 | 60개 유료 |
| **B2B 연구기관·기업** | 연구소·환경 분야 기업 | 데이터·API 라이선스, 맞춤 분석, **연구 도메인 초개인화 페이지** | 월 4회+ | 20개 유료 |
| **B2G 공공기관 (신규)** | 군청·읍면사무소·교육청·도청 | 정책 의사결정 데이터, 지역 동향 보고서, **담당 부서 초개인화 페이지** | 월 2~8회 | 10개 유료 |
| **AI 증강 시민기자** | 20~60대, 읍·면 균형(안면·소원·근흥·태안 등) | AI Co-Pilot, 원고료, 인센티브 | 주 1~2회 발행 | 12명 |

### 4.2 상세 사용자 페르소나

#### 페르소나 1: "주말마다 태안을 찾는 김지훈" (B2C Premium 후보)

**기본 정보**
- **연령:** 38세
- **직업:** 서울 거주 IT 회사 차장, 두 자녀 부모
- **기술 수준:** 중급~고급 (앱·구독 서비스 적극 사용)
- **주 사용 기기:** 모바일 (iOS), 노트북
- **사용 환경:** 출퇴근 지하철·집

**목표와 동기**
- 주말 가족 여행지로 태안 안면도·꽃지 해변 정기 방문
- 혼잡한 시간대를 피하고, 해넘이 최적 시간·기상 예측을 미리 알고 싶음
- 자녀 체험학습을 위한 지역 이벤트·갯벌 체험 정보 필요

**고충점 (Pain Points)**
- 기상청·관광공사·블로그·인스타그램을 여러 번 확인해야 함
- 만리포·천리포·안면도 등 해변별 미세 기상 차이를 일반 예보로는 알기 어려움
- 성수기 펜션 예약 타이밍을 놓쳐 비싸게 잡은 경험

**행동 패턴**
- 출퇴근 지하철에서 모바일로 5~10분 정보 탐색
- 한 곳에서 통합된 인사이트를 얻으면 즉시 구독 결정
- 카카오톡·가족 단톡방으로 공유

**기대 사항**
- 주간 예측 리포트(주말 기상·혼잡도·관광객 예측)
- 모바일 푸시 알림(주요 행사·해넘이 알림)
- 가족 단위 추천 콘텐츠

**대표 인용문**
> "주말마다 태안 가는데, 한 페이지만 보면 다음 주말이 어떨지 알 수 있다면 월 1만 원도 아깝지 않아요."

---

#### 페르소나 2: "안면도 펜션 사장 박미경" (B2B 기본 대시보드 후보)

**기본 정보**
- **연령:** 52세
- **직업:** 안면도 펜션 운영 8년차 (객실 6실)
- **기술 수준:** 초~중급 (예약 플랫폼·SNS 기본 사용)
- **주 사용 기기:** PC, 모바일 (Android)
- **사용 환경:** 펜션 카운터, 매일 아침 점검

**목표와 동기**
- 다음 주 객실 예약률·가격 책정 최적화
- 비수기 매출 보전을 위한 마케팅 타이밍 잡기
- 인근 관광지·날씨에 따라 픽업 서비스 운영 결정

**고충점 (Pain Points)**
- 예약 플랫폼 통계만으로는 시장 전체 트렌드를 알기 어려움
- 갑작스러운 미세먼지·태풍에 대비한 환불·운영 전략 부재
- B2B 컨설팅 서비스는 월 50만원 이상이라 부담

**행동 패턴**
- 매일 아침 8시 펜션 카운터에서 PC로 예약 상황 점검
- 단골 손님 카톡 응대 중 짬짬이 정보 확인
- 의사결정 후 직접 SNS·블로그에 홍보 글 작성

**기대 사항**
- 한눈에 보이는 주간 관광객·기상 예측 대시보드
- 월 3~5만 원의 합리적 구독료
- 카톡 알림 등 익숙한 채널 연동

**대표 인용문**
> "월 5만 원에 다음 주 안면도 손님이 얼마나 올지 알려준다면, 광고 한 번 더 돌릴지 말지 바로 결정할 수 있어요."

---

#### 페르소나 3: "AI 증강 시민기자 정수현" (Citizen Co-Pilot 사용자)

**기본 정보**
- **연령:** 45세
- **직업:** 근흥면 거주, 환경운동 활동가
- **기술 수준:** 중급 (스마트폰·SNS, 워드 작성 가능)
- **주 사용 기기:** 노트북, 스마트폰
- **사용 환경:** 자택·지역 카페에서 집필

**목표와 동기**
- 가로림만 환경 변화·해양 보전을 시민의 목소리로 알리고 싶음
- 본업과 병행 가능한 활동 (월 4~6편 발행 (3개월 활동, 총 12~18편), 인센티브 30만원)
- AI를 통해 사실 확인·문장 다듬기 시간을 줄이고 싶음

**고충점 (Pain Points)**
- 환경 데이터·공공 자료 검색에 1편당 3~4시간 소요
- 문장 다듬기·맞춤법 검수가 부담
- 저작권·인용 가이드 부재로 작성 시 자신감 부족

**행동 패턴**
- 주 2~3회 집필 세션 (각 2~3시간)
- 현장 답사 후 노트·사진을 정리해 기사화
- 편집장 검토 후 수정 반영

**기대 사항**
- AI Co-Pilot으로 사실 확인·요약·문장 다듬기 지원
- 명확한 저작권·인용 가이드
- 우수 기사 인센티브와 동료 시민기자 커뮤니티

**대표 인용문**
> "AI가 자료 정리만 도와줘도, 제 본업이 있어도 한 달에 5편은 쓸 수 있을 것 같아요."

---

### 4.3 사용자 여정 맵

**[B2C 사용자 여정]**
```
인지(SEO/SNS) → 무료 진입(taeannews.co.kr) → 가치 체험(주 1회 무료 리포트 미리보기)
   → 유료 전환(insight.taeannews.co.kr 구독) → 반복 사용(주간 알림) → 추천(가족·동료)
```

- **인지:** 네이버 검색·인스타·블로그 / 호기심 / 콘텐츠 마케팅 강화
- **무료 진입:** taeannews.co.kr 기존 트래픽 / 익숙함 / 크로스 프로모션 배너
- **가치 체험:** 주간 리포트 부분 공개 / "이거 유용한데?" / 무료→유료 미리보기 한정
- **유료 전환:** insight 도메인 결제 / 망설임 / 7일 무료 체험
- **반복 사용:** 모바일 푸시·이메일 / 만족 / 개인화 추천
- **추천:** 단톡방·SNS 공유 / 자부심 / 추천 코드 인센티브

**[B2B 사용자 여정]**
```
영업 컨택 → 기본 대시보드 무료 체험(14일) → 가격 협상 → 계약 체결
   → 정기 활용(주 1회 업데이트) → 프리미엄 업그레이드 → 갱신/추천
```

---

## 5. 사용자 스토리 (User Stories)

### Story 1: 주간 태안 예측 인사이트 리포트 구독 (B2C Premium)

**As a** 외부 거주 관광객(김지훈 페르소나),
**I want to** 매주 금요일 다음 주말의 태안 관광·기상·해넘이 예측을 한 페이지로 받아보고,
**So that I can** 여행 계획을 효율적으로 세우고 혼잡을 피할 수 있다.

**수용 기준:**
- [ ] 사용자가 `insight.taeannews.co.kr`에서 회원가입 후 Premium 구독 결제 가능
- [ ] 매주 금요일 09:00 (KST)에 다음 주(월~일) 예측 리포트가 배치 생성되어 발행
- [ ] 리포트에는 관광객 예측, 기상 요약, 해넘이/물때, 추천 명소·식당이 포함
- [ ] 이메일 + 웹 푸시 + 모바일 푸시 알림 발송
- [ ] Premium 구독자는 PDF 다운로드, 무료 사용자는 미리보기 30% 노출
- [ ] 리포트 본문 상단에 [AI 보조] 라벨 + HITL 검토자 이니셜 표기
- [ ] 구독 결제·해지 플로우 3클릭 이내

**태스크 분해 힌트:**
- Task 1.1: 리포트 데이터 모델 및 CMS 스키마 설계 (4h)
- Task 1.2: 배치 생성 워크플로(매주 목요일 22:00 시작) (6h)
- Task 1.3: 리포트 템플릿(HTML/PDF) 디자인 및 컴포넌트 (8h)
- Task 1.4: 구독 권한 체크 미들웨어 (3h)
- Task 1.5: 이메일/푸시 발송 파이프라인 (5h)
- Task 1.6: E2E 발행 시나리오 테스트 (4h)

**의존성:** REQ-AI-001 (LangGraph Lite Router), REQ-DATA-001 (예측 데이터 파이프라인)
**우선순위:** Must Have (P0)

---

### Story 2: AI Query Agent로 즉답 받기 (B2C/B2B 공통)

**As a** 펜션 사장(박미경 페르소나),
**I want to** "다음 주 안면도 미세먼지 예보 알려줘"처럼 자연어로 질문하면 즉시 답을 받고,
**So that I can** 운영 의사결정을 빠르게 내릴 수 있다.

**수용 기준:**
- [ ] 자연어 입력창 + 추천 질문 카드 5개 노출
- [ ] 캐시 히트 시 < 1초, 미스 시 < 8초 내 응답
- [ ] 답변에 출처(원본 기사/공공 데이터) 인용 표기 필수
- [ ] 답변에 [AI 보조] 라벨 자동 부착
- [ ] B2C는 일 5회/B2B는 일 30회로 무료 한도 설정, 초과 시 업그레이드 안내
- [ ] PII(전화번호·이메일) 입력 시 자동 마스킹 후 처리
- [ ] 민감 주제(선거·범죄·의료)는 사전 차단 안내 메시지 출력

**태스크 분해 힌트:**
- Task 2.1: LangGraph Lite Router Agent 구현 (8h)
- Task 2.2: 2개 Expert Agent(Prediction, Generation) 구현 (10h)
- Task 2.3: 캐시 키 설계 및 Redis 캐싱 레이어 (6h)
- Task 2.4: 출처 인용 메타데이터 시스템 (4h)
- Task 2.5: PII 자동 마스킹 미들웨어 (3h)
- Task 2.6: 민감 주제 분류기(키워드+분류 모델) (5h)
- Task 2.7: 응답 시간 측정 및 부하 테스트 (4h)

**의존성:** REQ-AI-001, REQ-AI-002, REQ-INFRA-001 (Self-hosted LLM)
**우선순위:** Must Have (P0)

---

### Story 3: B2B 기본 대시보드 (B2B 기본)

**As a** 펜션·소상공인 운영자,
**I want to** 주 1회 업데이트되는 관광·상권·환경 지표 대시보드를 보고,
**So that I can** 가격 정책·마케팅 타이밍을 데이터 기반으로 결정한다.

**수용 기준:**
- [ ] 대시보드 메인: 관광객 예측(주간), 미세먼지·기상, 토지·임대 시세, 경쟁 업종 동향 카드 4개
- [ ] 주 1회(매주 월요일 07:00) 자동 업데이트
- [ ] 지역(읍·면) 필터, 기간(주/월/분기) 필터
- [ ] CSV 다운로드 기능
- [ ] B2B 권한 사용자만 접근 (계약 관리 시트 연동)
- [ ] 일일 1회 이메일 요약 알림 옵션
- [ ] 모든 차트는 출처·업데이트 일시 표기

**태스크 분해 힌트:**
- Task 3.1: 대시보드 데이터 모델 및 ETL (10h)
- Task 3.2: 차트 컴포넌트(Recharts/Apache ECharts) 구현 (8h)
- Task 3.3: 권한 모델 및 B2B 인증 (4h)
- Task 3.4: CSV 내보내기 (3h)
- Task 3.5: 이메일 요약 알림 (3h)

**의존성:** REQ-DATA-001, REQ-PLATFORM-002
**우선순위:** Must Have (P0)

---

### Story 4: AI 증강 시민기자 Co-Pilot (시민기자단)

**As a** 시민기자(정수현 페르소나),
**I want to** AI Co-Pilot으로 사실 확인·요약·문장 다듬기를 받으면서 기사를 작성하고,
**So that I can** 본업과 병행하며 월 4~6편(3개월 총 12~18편)을 안정적으로 발행할 수 있다.

**수용 기준:**
- [ ] 시민기자 전용 작성 화면(웹 에디터)에서 AI 보조 5종 제공:
  - (a) 사실 확인 검색 (b) 문단 요약 (c) 문장 다듬기 (d) 제목 후보 5종 (e) 인용 출처 검색
- [ ] 모든 AI 보조 결과는 "원본 vs 제안" 좌우 비교 UI로 표시
- [ ] 편집자가 HITL 검토 후 [AI 보조] 라벨 부착하여 발행
- [ ] 시민기자별 월간 발행 건수·원고료 자동 집계 대시보드
- [ ] 6회 교육 프로그램의 학습 모듈(영상·과제·퀴즈) 내장
- [ ] 인센티브 정산(편당 5~10만원 + 우수 기자 30만원) 관리자 화면

**태스크 분해 힌트:**
- Task 4.1: 시민기자 권한 모델 (3h)
- Task 4.2: 웹 에디터 통합 (TipTap/ProseMirror) (10h)
- Task 4.3: AI 보조 5종 API 연동 (8h)
- Task 4.4: 원본·제안 좌우 비교 UI (6h)
- Task 4.5: HITL 검토 워크플로(작성→검토→승인→발행) (8h)
- Task 4.6: 발행/원고료 정산 대시보드 (6h)
- Task 4.7: 학습 모듈(LMS Lite) (5h)

**의존성:** REQ-AI-001, REQ-AI-002, REQ-CITIZEN-001
**우선순위:** Must Have (P0)

---

### Story 5: Hybrid 자산 연동 (Cross-Platform Sync)

**As a** 신규 방문자,
**I want to** `taeannews.co.kr`에서 본 무료 기사 하단에서 자연스럽게 `insight` 유료 인사이트를 추천받고,
**So that I can** 별도 회원가입 부담 없이 가치를 체험하고 전환할 수 있다.

**수용 기준:**
- [ ] taeannews.co.kr 기사 페이지 하단에 관련 insight 리포트 카드 자동 노출
- [ ] 두 도메인 간 SSO(OAuth2) 적용으로 한 번 로그인 시 양쪽 사용 가능
- [ ] insight 도메인에서 클릭한 출처가 taeannews.co.kr 기사일 경우 정확히 매핑
- [ ] 무료 체험 7일 자동 제공 후 결제 유도

**태스크 분해 힌트:**
- Task 5.1: SSO(OAuth2) 통합 (6h)
- Task 5.2: 기사·리포트 매핑 메타데이터 (4h)
- Task 5.3: 추천 카드 컴포넌트 (4h)
- Task 5.4: 무료 체험 권한 부여 로직 (3h)

**의존성:** REQ-PLATFORM-001
**우선순위:** Should Have (P1)

---

### Story 6: 비용 모니터링 대시보드 (운영자)

**As a** 사업 책임자(태안신문 대표·디지털전환 총괄),
**I want to** AI 운영비를 실시간으로 모니터링하고 30만원 임계값에 다가가면 알림을 받고,
**So that I can** 비용 폭주를 사전에 차단할 수 있다.

**수용 기준:**
- [ ] LLM 토큰 사용량, GPU 인스턴스 시간, 외부 API 호출, 스토리지 비용을 일·주·월 단위로 집계
- [ ] 월 누적 비용 70%·90%·100% 도달 시 슬랙·이메일 알림
- [ ] 캐시 히트율, 배치 처리 효율, 모델별 비용 분포 시각화
- [ ] 자동 차단 임계값(월 100%) 도달 시 비필수 호출 자동 차단

**태스크 분해 힌트:**
- Task 6.1: 비용 이벤트 수집 미들웨어 (5h)
- Task 6.2: 비용 집계 ETL (4h)
- Task 6.3: 대시보드 UI (Grafana 또는 자체) (6h)
- Task 6.4: 알림 발송(Slack/Email) (3h)
- Task 6.5: 자동 차단(서킷 브레이커) 로직 (4h)

**의존성:** 모든 AI 호출 경로
**우선순위:** Must Have (P0)

---

## 6. 기능적 요구사항 (Functional Requirements)

### Must Have (P0) — 출시 필수

#### REQ-AI-001: LangGraph Lite Router + 2 Expert Agents
**설명:** 사용자 질의를 분석하여 Prediction Agent 또는 Generation Agent로 라우팅하고, 결과를 통합 응답으로 반환하는 경량 오케스트레이션 계층을 구축한다.

**수용 기준:**
- [ ] Router Agent: 입력 질의 분류(예측/생성/팩트체크/기타) 정확도 ≥ 85%
- [ ] Prediction Agent: 관광·환경·부동산 도메인 예측 질의 처리
- [ ] Generation Agent: 요약·문장 다듬기·제목 생성 처리
- [ ] 실시간 Multi-Agent 호출 횟수 최소화 (질의당 평균 ≤ 2회 LLM 호출)
- [ ] 모든 응답에 출처·라벨 메타데이터 자동 부착

**기술 명세:**
```typescript
interface RouterDecision {
  intent: "prediction" | "generation" | "factcheck" | "other";
  confidence: number;        // 0~1
  domain?: "tourism" | "environment" | "realestate";
  cacheKey: string;          // 캐시 우선 확인
}

interface AgentResponse {
  content: string;
  sources: Array<{title: string; url: string; publishedAt: string}>;
  aiLabel: "ai_generated" | "ai_assisted" | "human";
  tokensUsed: number;
  costEstimateKRW: number;
}
```

**태스크 분해:**
- LangGraph Lite 환경 설정 및 기본 라우터: Medium (8h)
- Prediction Agent 프롬프트 엔지니어링: Medium (8h)
- Generation Agent 프롬프트 엔지니어링: Medium (6h)
- 응답 메타데이터 표준화: Small (3h)
- 라우터 분류 정확도 평가셋 구축 및 측정: Medium (6h)

**의존성:** REQ-INFRA-001 (Self-hosted Quantized LLM)

---

#### REQ-AI-002: 캐싱 우선 응답 시스템 (목표 히트율 ≥ 75%)
**설명:** 사전 생성된 응답·자주 묻는 질의를 캐시에서 즉시 제공하여 LLM 호출 비용을 75% 이상 절감한다.

**수용 기준:**
- [ ] 캐시 키 표준화: 정규화된 질의 + 도메인 + 시간 윈도우(일/주)
- [ ] 캐시 히트율 일·주 단위 측정 가능
- [ ] 사전 생성 응답: 매일 새벽 02:00 배치로 상위 200개 인기 질의 갱신
- [ ] 캐시 TTL 정책: 예측 리포트 7일, 일반 답변 24시간, 시세 데이터 6시간
- [ ] 캐시 미스 시에만 LLM 호출, 호출 결과는 자동 캐시 적재

**기술 명세:**
```typescript
// 캐시 키 정규화 규칙
function buildCacheKey(query: string, ctx: {domain?: string; date?: string}): string {
  const normalized = query.trim().toLowerCase().replace(/\s+/g, " ");
  return `qa:${ctx.domain ?? "general"}:${ctx.date ?? "current"}:${sha256(normalized)}`;
}

// TTL 정책 (초)
const TTL_POLICY = {
  weeklyReport: 7 * 86400,
  generalQA: 86400,
  marketData: 6 * 3600,
};
```

**태스크 분해:**
- Redis 클러스터 설정 및 보안: Small (3h)
- 캐시 키 정규화 및 해싱: Small (3h)
- TTL 정책 및 무효화 로직: Medium (5h)
- 사전 생성 배치 잡(Top-N): Medium (5h)
- 캐시 히트율 메트릭 수집: Small (3h)

**의존성:** REQ-AI-001

---

#### REQ-AI-003: 배치 처리 파이프라인 (주 1회 + 일 1회)
**설명:** 주간 인사이트 리포트, B2B 대시보드, 일일 사전 생성 응답을 유휴 시간대에 배치로 생성하여 실시간 부하·비용을 분산한다.

**수용 기준:**
- [ ] 주간 리포트 배치: 매주 목요일 22:00 시작, 금요일 06:00까지 완료
- [ ] 일일 사전 생성 배치: 매일 02:00~04:00
- [ ] 배치 실패 시 자동 재시도 3회, 실패 시 슬랙 알림
- [ ] 배치 진행 상황 모니터링 화면
- [ ] 배치 결과 데이터 무결성 체크섬 검증

**태스크 분해:**
- 잡 스케줄러(Cron 또는 Temporal) 설정: Medium (5h)
- 주간 리포트 배치 잡: Medium (8h)
- 일일 사전 생성 배치 잡: Medium (5h)
- 모니터링 UI: Small (4h)

**의존성:** REQ-AI-001, REQ-DATA-001

---

#### REQ-INFRA-001: Hybrid LLM 인프라 (Batch API + Serverless 한국어 모델)
**설명:** 자체 GPU 호스팅을 포기하고 **외부 API 2종을 용도별로 조합한 Hybrid 구조**로 전환한다. 비동기 배치는 Anthropic Batch API(50% 할인)로 품질·비용 균형, 실시간 사용자 질의는 Together AI Solar Mini로 저비용·한국어 우수성 확보.

**결정 사항 (2026-05-26, v1.2):**
- **인프라:** **Hybrid 외부 API** — 초기 투자 0원, idle 비용 0원
- **배치 채널** (주간 리포트·일일 사전 생성·임베딩 갱신): **Anthropic Claude Haiku/Sonnet Batch API** (50% 할인)
- **실시간 채널** (AI Query Agent·시민기자 Co-Pilot): **Together AI Solar Mini** ($0.20/1M tokens, 한국어 최적)
- **백업·우선 폴백:** 두 API 모두 장애 시 캐시된 응답 + "잠시 후 다시 시도해주세요" 우아한 메시지
- **장기 옵션:** 2027년 트래픽·매출 검증 후 Solar-10.7B 자체 호스팅 재검토 (사업계획서 장기 로드맵에 반영)

**수용 기준:**
- [ ] Anthropic API 키 발급 + Batch API 통합 (5~10만원 prepaid 시작)
- [ ] Together AI API 키 발급 + Solar Mini SDK 통합
- [ ] Phase 1 벤치마크: Together AI Solar Mini, Anthropic Claude Haiku, (참고용) 자체 호스팅 Llama-3.1-8B 비교 — **한국어 평가셋 500문항** (v1.3 강화: 관광·환경·부동산 도메인별 균형 확보)
- [ ] 응답 라우터에서 배치/실시간 채널 자동 분기 (배치: 비동기 큐 → Anthropic Batch / 실시간: 즉시 → Together AI)
- [ ] 두 API 모두 장애 시 캐시 폴백 동작 검증
- [ ] 월 운영비 30만원 이내 실측 검증 (Phase 2 종료 시점)
- [ ] 일일 API 사용량 알림 (LLM API 호출 + 토큰 사용량)

**예산 영향 (v1.3 재배분 → v1.9 누적):**
- 사업계획서 §4 "데이터 수집·인프라 구축 6,000,000원" 중 GPU 자체 PC 구매(약 400만원) 부분 삭제
- **v1.3 절감분 400만원 재배분:**
  - +200만원 → AI Core Engine 개발 (한국어 도메인 프롬프트 엔지니어링, 캐시 키 최적화, Hybrid Router 고도화)
  - +100만원 → 한국어 평가셋 구축 강화 (200문항 → 500문항, 도메인별 균형 확보)
  - +100만원 → Phase 3 외부 베타 테스터 인센티브 (50명 → 100명, NPS 신뢰도 향상)
- **v1.9 추가 재배분 (2026-05-29):** Citizen Co-Pilot & 교육 −150만 / 마케팅·B2B 영업 −150만 → AI Core Engine +150만 / 플랫폼·Hybrid +150만 (활동 3개월 단축 및 `/me`·B2G·OpenNext 구현분 보강). 자세한 표는 9장 참고
- **v1.9 최종 AI Core Engine 누계: 19,000,000원 (38%)** — 사업계획서 "AI 기술 투자 56%" 방향성과 정합

**태스크 분해:**
- 모델 후보별 벤치마크: Medium (8h)
- 양자화 변환(GPTQ/AWQ) 및 검증: Medium (6h)
- vLLM/TGI 서버 구성 및 도커화: Medium (6h)
- 자체 도메인 평가셋 구축: Medium (8h)
- 추론 부하 테스트: Small (4h)

**의존성:** 없음 (즉시 착수 가능)

---

#### REQ-DATA-001: 데이터 수집·전처리·Vector DB·Knowledge Graph
**설명:** 20년치 태안신문 기사 + 공공 데이터(관광·해양·기상·부동산)를 수집·정제하여 PGVector/Chroma 기반 RAG와 Lite Knowledge Graph로 구축한다.

**수용 기준:**
- [ ] 태안신문 자체 기사 약 20년치 크롤링·OCR·메타데이터 정제
- [ ] 공공 데이터: 한국관광공사 TourAPI, 기상청 API, 해양수산부 OpenAPI, KOSIS 인구·부동산
- [ ] 임베딩 모델: 한국어 최적 모델(`BGE-M3-Korean` 또는 `KURE-v1`) 선정
- [ ] PGVector 인덱스 빌드, top-k=8 평균 응답 ≤ 200ms
- [ ] Lite Knowledge Graph: 장소·인물·사건 등 엔티티 관계도 (Neo4j 또는 NetworkX)
- [ ] 매일 새벽 증분 인덱싱 자동화

**기술 명세:**
```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY,
  source VARCHAR(50) NOT NULL,        -- "taeannews", "tour_api", "weather", ...
  title TEXT,
  body TEXT,
  published_at TIMESTAMP,
  location VARCHAR(100),              -- 읍·면 단위
  category VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE document_embeddings (
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INT,
  chunk_text TEXT,
  embedding vector(1024),             -- pgvector
  PRIMARY KEY (document_id, chunk_index)
);

CREATE INDEX ON document_embeddings USING hnsw (embedding vector_cosine_ops);
```

**태스크 분해:**
- 자체 기사 크롤링 + OCR 정제: Large (16h)
- 공공 API 수집 파이프라인: Medium (10h)
- 임베딩 모델 선정 및 벤치마크: Medium (6h)
- PGVector 스키마/인덱스: Small (4h)
- Lite KG 엔티티 추출 및 적재: Medium (10h)
- 증분 인덱싱 잡: Small (4h)

**의존성:** 없음

---

#### REQ-PLATFORM-001: insight.taeannews.co.kr 웹 플랫폼 (Next.js)
**설명:** 신규 AI 서비스용 도메인을 Next.js 기반으로 구축, taeannews.co.kr과 SSO·크로스 프로모션 연동.

**수용 기준:**
- [ ] Next.js 14+ (App Router), TypeScript
- [ ] 반응형(모바일·태블릿·데스크톱), 고령자 친화 UI 옵션(글자 크기·고대비)
- [ ] WCAG 2.1 AA 준수 ((주)엔씨투의 접근성 SW 전문성 활용)
- [ ] SSO(OAuth2)로 taeannews.co.kr 계정 통합
- [ ] SEO 최적화(메타 태그·구조화 데이터·sitemap)

**태스크 분해:**
- 프로젝트 부트스트랩 및 디자인 시스템: Medium (6h)
- 페이지 라우팅 및 레이아웃: Medium (8h)
- 접근성 컴포넌트(글자 크기·고대비 토글): Medium (6h)
- SSO 통합: Medium (6h)
- SEO·구조화 데이터: Small (4h)

**의존성:** 없음

---

#### REQ-PLATFORM-002: Backend API + Hybrid Sync
**설명:** insight 플랫폼 백엔드 API와 taeannews.co.kr(엔디소프트 CMS) 간 데이터 동기화 파이프라인.

**수용 기준:**
- [ ] REST API (OpenAPI 3.1 문서화)
- [ ] taeannews.co.kr CMS 변경분 5분 이내 동기화
- [ ] 결제·구독 PG 연동(**토스페이먼츠** 선정 — 개발자 친화 API·구독 빌링키 지원·수수료 약 3%)
- [ ] OAuth2 인증, JWT 발급(액세스 토큰 1h, 리프레시 7일)
- [ ] 속도 제한: 익명 60req/min, 인증 300req/min, B2B 1,000req/min

**태스크 분해:**
- API 프레임워크 설정(NestJS/FastAPI): Medium (6h)
- 인증·인가(OAuth2 + JWT): Medium (8h)
- CMS Sync 파이프라인: Medium (8h)
- PG 결제 연동: Medium (8h)
- 속도 제한 미들웨어: Small (3h)

**의존성:** REQ-PLATFORM-001

---

#### REQ-PRODUCT-001: 주간 태안 예측 인사이트 리포트
**설명:** 매주 1회 배치 생성되는 관광·환경·부동산 예측 리포트(웹 + PDF + 이메일).

**수용 기준:**
- [ ] 리포트 표준 구조: 요약 / 관광·기상 예측 / 환경 모니터링 / 부동산 시세 동향 / 다음 주 이벤트
- [ ] PDF는 Premium 구독자에게만 다운로드 허용
- [ ] 이메일 뉴스레터 발송(매주 금요일 09:00)
- [ ] 모든 수치에 출처 표기, [AI 보조] 라벨

**태스크 분해:** Story 1 참조

**의존성:** REQ-AI-001, REQ-AI-003, REQ-DATA-001

---

#### REQ-PRODUCT-002: AI Query Agent (캐싱 우선·경량)
**설명:** 자연어 질의응답 인터페이스 — Story 2 참조.

**의존성:** REQ-AI-001, REQ-AI-002, REQ-INFRA-001

---

#### REQ-PRODUCT-003: B2B 기본 대시보드
**설명:** 주 1회 업데이트되는 관광·환경 지표 대시보드 — Story 3 참조.

**의존성:** REQ-DATA-001, REQ-PLATFORM-002

---

#### REQ-PRODUCT-005: 초개인화 회원 페이지 `/me` (v1.7 신규)
**설명:** 승인된 모든 회원(B2C·B2B·B2G)이 자신의 관심 지역·분야·즐겨찾기를 기반으로 맞춤 콘텐츠·알림을 받는 통합 회원 페이지. 결제·플랜 정보, 사용량, AI 질의 이력, 저장한 리포트도 한 화면에서 관리.

**수용 기준 (v1.8 상세 설계 반영):**
- [ ] 라우트: `insight.taeannews.co.kr/me` — 미인증 시 SSO 로그인 리다이렉트
- [ ] **온보딩 흐름** (최초 로그인 시): 관심 지역(읍·면 다중 선택, 세그먼트별 한도 적용) → 관심 분야(관광·환경·부동산·정책·산업·문화) → 알림 수신 방법(이메일·웹푸시·카카오 알림톡 중 다중) 입력 후 저장
- [ ] **(1) 세그먼트별 첫 화면 톤 자동 전환 (v1.8)**:
  - **B2C: "환영" 톤** — 인사말 + 즐겨찾기 명소 카드 + 다음 주말 미리보기 + 추천 명소
  - **B2B·B2G: "도구" 톤** — 대시보드 헤더 + 핵심 KPI 4종 + 트렌드 차트
  - **B2C Premium 토글**: 화면 상단에 "도구 모드로 보기" 토글, 사용자 선택 저장
- [ ] **(2) 개인화 깊이 L1만 v1.0 (v1.8)**:
  - 사용자 명시 선택만 활용 (관심 지역·분야·즐겨찾기)
  - 백엔드는 공통 캐시된 데이터 반환 + **프론트엔드에서 필터·재정렬** (캐싱 75% 보호)
  - 행동 학습(L2)·AI 임베딩 추천(L3)은 2027~2028 로드맵
- [ ] **(3) 단일 `/me` 라우트 + 위젯 가시성 제어 (v1.8)**:
  - 같은 페이지 골격, 세그먼트에 따라 위젯이 자동 표시/숨김
  - 위젯 종류:
    - `welcome_banner` (B2C 노출, B2B/B2G 미노출)
    - `kpi_cards` (B2B/B2G 노출 상단, B2C는 하단)
    - `favorites_list` (전 세그먼트, B2C는 명소 위주, B2B는 상권 위주, B2G는 정책 자료 위주)
    - `personalized_report` (B2C Premium 이상)
    - `team_workspace` (B2B 기본 이상)
    - `b2g_department_space` (B2G만)
    - `usage_panel` (전 세그먼트)
  - 모바일에서는 세그먼트별 기본 위젯 정렬 다르게
- [ ] **(4) 콘텐츠 등급 3종 (Critical/Community/Personal) 노출 정책 (v1.8)**:
  - **Critical**: 사용자 관심사 무관 모든 사용자에게 상단 배너로 노출 (적조·태풍·대형 사고)
  - **Community**: 관심 분야 일치 안 해도 본문 하단에 작게 노출 (군수 인터뷰·군의회 의결)
  - **Personal**: 사용자 관심 지역·분야 일치 시만 노출 (펜션 추천·미세먼지 예보)
  - 등급 선택은 발행자(편집부·시민기자)가 발행 시 입력 — REQ-CITIZEN-001 HITL 워크플로에 포함
  - AI 보조 분류 가능: AI가 등급 추천 → 편집자 최종 확정
- [ ] **세그먼트별 차등 한도** (DB `segment_limits` 시드 데이터):
  - B2C Basic: 지역 2·분야 2·즐겨찾기 10
  - B2C Premium: 지역 5·분야 4·즐겨찾기 50·맞춤 PDF
  - B2B 기본/프리미엄: + 팀원 초대(3/10명) + 상권 위젯
  - B2G: + 부서 공유 공간 + 보고서 자동 생성 + 부서원 20명까지
- [ ] **푸시 알림 옵트인** — 관심 지역의 Critical·Personal 콘텐츠 자동 발송 (HITL 검증). **W3C 표준 Web Push 직접 구현** (Firebase·FCM 미사용 — v1.7 결정). Cloudflare Workers의 `web-push` 라이브러리로 발송, VAPID 키는 환경변수로 관리
- [ ] 개인 설정은 언제든 변경 가능, 변경 이력은 감사 로그에 기록
- [ ] **개인정보**: 관심사 데이터는 사용자 본인만 조회 가능, 추천 서비스 외 활용 금지 (PRD §7.2 보안)

**기술 명세 (요약):**
```typescript
interface UserPreferences {
  userId: string;
  segment: "b2c_basic" | "b2c_premium" | "b2b_basic" | "b2b_premium" | "b2g";
  regions: string[];          // 읍·면 코드 배열 (세그먼트별 한도 적용)
  categories: ("tourism" | "environment" | "realestate" | "policy" | "industry" | "culture")[];
  notificationChannels: ("email" | "webpush" | "kakao")[];
  favorites: Array<{ kind: "place" | "event" | "report"; refId: string }>;
  updatedAt: string;
}
```

**태스크 분해:**
- 데이터 모델·마이그레이션 (`user_preferences`·`user_favorites`·`notification_subscriptions`): Medium (5h)
- 온보딩 위저드 UI: Medium (8h)
- `/me` 대시보드 페이지 (세그먼트별 분기 렌더링): Large (12h)
- 개인화 추천 알고리즘 (관심 지역·분야 기반 콘텐츠 필터링): Medium (8h)
- 푸시 알림 옵트인 + Web Push 통합: Medium (6h)
- B2G 부서 공유 공간 + 보고서 자동 생성: Large (10h)
- 권한·세그먼트별 한도 미들웨어: Small (4h)
- 통합 테스트(세그먼트별 시나리오 5종): Medium (6h)

**의존성:** REQ-PLATFORM-001 (`/me` 라우트), REQ-PLATFORM-002 (인증·세그먼트 정보), REQ-PRODUCT-001 (개인화 리포트 재구성)

**우선순위:** Must Have (P0) — B2C Premium 차별화 가치 + B2G 진입 핵심

---

#### REQ-CITIZEN-001: AI 증강 시민기자단 운영 시스템
**설명:** 12명 시민기자의 모집·교육·집필·검토·정산·평가 전 과정을 지원하는 운영 시스템.

**수용 기준:**
- [ ] 시민기자 신청·선발(읍·면 균형, 연령 다양성) 폼
- [ ] 6회 교육 프로그램 LMS(영상·자료·과제·퀴즈)
- [ ] AI Co-Pilot 통합 웹 에디터 — Story 4 참조
- [ ] HITL 검토 워크플로(작성→AI 검증→에디터 검토→**콘텐츠 등급 확정**(Critical/Community/Personal, v1.8)→발행)
- [ ] 발행 건수·원고료 자동 집계, 우수 기자 인센티브 시상
- [ ] **월간 정산 (v1.4)**: 매월 25일 23:59 집계, 말일 계산, 익월 5영업일 이내 이체. 시민기자 마이페이지에서 정산 내역·이체 상태 실시간 확인

**태스크 분해:** Story 4 참조

**의존성:** REQ-AI-001, REQ-AI-002, REQ-PLATFORM-001

---

#### REQ-GOV-001: AI 윤리·데이터 거버넌스 4대 원칙 구현
**설명:** AI 콘텐츠 표기, 저작권·인용, 개인정보 보호, HITL 검토를 코드 수준에서 강제한다.

**수용 기준:**
- [ ] 모든 AI 생성/보조 콘텐츠에 자동 [AI 보조] 라벨 부착 (제거 불가능한 메타데이터)
- [ ] 외부 인용 시 출처 URL·발행일 자동 기록, 누락 시 발행 차단
- [ ] PII 자동 탐지(이름·전화·이메일·주민번호 패턴) 및 마스킹
- [ ] KISA 개인정보 처리방침 준수, 학습 데이터에서 PII 제외
- [ ] 민감 주제 **7종 카테고리** 분류기로 AI 단독 발행 차단, HITL 강제 (선거·범죄·의료·종교 + 정치적 인물·부동산 투기 자문·소수자 이슈 — v1.4 확장)
- [ ] HITL 검토 로그 영구 보존 (감사 추적)

**태스크 분해:**
- AI 라벨 자동 부착 미들웨어: Small (3h)
- 출처 검증 발행 가드: Small (3h)
- PII 탐지·마스킹(정규식 + KISA 가이드): Medium (6h)
- 민감 주제 분류기: Medium (6h)
- HITL 검토 로그 시스템: Medium (5h)

**의존성:** REQ-AI-001, REQ-PRODUCT-001~003, REQ-CITIZEN-001

---

#### REQ-COST-001: 비용 모니터링 & 서킷 브레이커
**설명:** AI 운영비 30만원 임계값 강제 — Story 6 참조.

**의존성:** REQ-AI-001, REQ-INFRA-001

---

### Should Have (P1) — 중요하지만 블로킹 아님

#### REQ-PRODUCT-004: B2B 프리미엄 (관광·환경 맞춤 분석)
**설명:** B2B 기본 대시보드 위에 맞춤 분석·API·전담 컨설팅을 제공하는 상위 티어.

**수용 기준:**
- [ ] B2B 기본 대시보드 모든 기능 포함
- [ ] 맞춤 분석 의뢰(월 2건 한도) 워크플로
- [ ] 분석 결과 PDF 자동 생성
- [ ] 전담 매니저 슬랙 채널 운영(외부 슬랙 워크스페이스)

**태스크 분해:**
- 맞춤 분석 의뢰 폼: Small (3h)
- 분석 결과 PDF 템플릿: Small (4h)
- 매니저 슬랙 봇 연동: Small (3h)

**의존성:** REQ-PRODUCT-003

---

#### REQ-DATA-002: 데이터·API 판매 (B2B)
**설명:** 가공된 예측·시세 데이터를 API/CSV 형태로 라이선스 판매.

**수용 기준:**
- [ ] API 키 발급·관리 시스템
- [ ] 사용량 기반 과금(월 호출 수)
- [ ] OpenAPI 문서 + Try-It 콘솔

**태스크 분해:**
- API 키 관리 UI: Small (4h)
- 사용량 집계 및 과금 로직: Medium (6h)
- API 문서 + Try-It: Small (4h)

**의존성:** REQ-PLATFORM-002

---

#### REQ-PLATFORM-003: SSO + Cross-Promotion
**설명:** Story 5 참조.

---

### Nice to Have (P2) — 향후 개선

#### REQ-FUTURE-001: 모바일 앱 (네이티브)
- v1.0은 웹 반응형으로 충분, 2027년 이후 검토

#### REQ-FUTURE-002: 도메인 특화 파인튜닝
- Solar/Llama 모델을 태안 지역 코퍼스로 LoRA 파인튜닝, 2028년 로드맵

#### REQ-FUTURE-003: 인근 지역신문 연합 플랫폼 (서해안 AI Hub)
- 2030년 비전, 서산·당진·홍성 지역신문 합류 시 멀티테넌트 아키텍처 필요

---

## 7. 비기능적 요구사항 (Non-Functional Requirements)

### 7.1 성능 (Performance)

**응답 시간:**
- 캐시 히트 응답: < 1초 (p95)
- 캐시 미스 (LLM 호출): < 8초 (p95)
- 페이지 로드: 모바일 4G에서 < 3초
- B2B 대시보드 초기 렌더: < 2초

**처리량:**
- 정상: 50 req/sec (MAU 12,000 기준 추정)
- 피크: 200 req/sec (이벤트·재해 보도 시)

**리소스:**
- 단일 GPU 인스턴스(RTX 4090급) 1대 또는 A10G 클라우드 인스턴스
- 메모리: 추론 서버 24GB VRAM, 백엔드 4GB RAM
- 캐시 히트율 75% 이상 유지

### 7.2 보안 (Security)

**인증·인가:**
- JWT 액세스 토큰 1시간, 리프레시 7일
- OAuth2 SSO (taeannews.co.kr 통합)
- B2B는 IP 화이트리스트 옵션 제공
- 역할: anonymous · b2c_basic · b2c_premium · b2b_basic · b2b_premium · citizen_reporter · editor · admin

**데이터 보호:**
- HTTPS(TLS 1.3) 강제
- 비밀번호: bcrypt(cost=12)
- PII는 AES-256-GCM으로 암호화 후 저장
- 결제 정보는 PG사에 위임, 자체 저장 금지
- 학습 데이터·인덱스에서 PII 자동 제거 (REQ-GOV-001)

**컴플라이언스:**
- 개인정보보호법, KISA 처리방침 준수
- 신문법(지역신문발전법) 준수
- 저작권법: 외부 인용 시 출처·인용 비율 준수

### 7.3 확장성 (Scalability)

**사용자 부하:**
- 초기 MAU 12,000 → 2027년 30,000, 2030년 100,000+ 목표
- 컨테이너화(Docker) 기반 수평 확장 준비
- 단, 본 사업 단계(2026)에서는 단일 인스턴스 + 캐시로 충분

**데이터 볼륨:**
- 초기: 20년치 기사 약 10GB + 임베딩 약 5GB
- 월 증분: 약 100MB (자체 기사 + 공공 데이터)
- 보관: 영구 (역사 자료로서의 가치)

### 7.4 신뢰성 (Reliability)

**가동 시간:**
- SLA: 99.5% (월 다운타임 < 3.6h)
- RTO: < 4시간
- RPO: < 24시간 (일일 백업)

**에러 핸들링:**
- 모든 외부 API(공공 데이터·LLM) 호출에 서킷 브레이커
- 캐시 미스 + LLM 다운 시 "지금 일시적으로 응답이 어렵습니다" 우아한 메시지
- 모든 에러는 구조화 로그(JSON) + Sentry 보고

**모니터링:**
- Grafana 대시보드: 비용·성능·캐시·에러율
- Slack 알림: 비용 70/90/100%, 에러율 > 1%, 추론 지연 > 15초

### 7.5 접근성 (Accessibility)

**(주)엔씨투의 핵심 강점 — 20년 접근성 SW 전문성을 적극 적용:**
- WCAG 2.1 Level AA 전 페이지 준수
- 시각장애인용 스크린 리더 최적화 (배리어프리 영화 앱 AudioView 노하우 적용)
- 고령자 친화 옵션: 글자 크기 3단계, 고대비 모드, 읽어주기(TTS)
- 모든 차트·이미지에 대체 텍스트
- 키보드만으로 전 기능 사용 가능

### 7.6 호환성 (Compatibility)

- **브라우저:** Chrome/Firefox/Safari/Edge 최근 2버전
- **모바일:** iOS 14+, Android 10+
- **반응형:** 320px / 768px / 1024px / 1440px

### 7.7 AI 품질·윤리

- **AI 콘텐츠 비율 42% 유지** (전체 발행 기사 중)
- **HITL 검증 비율 100%** — AI 단독 발행 금지
- 모든 AI 응답에 출처 인용 + [AI 보조] 라벨
- 민감 주제(선거·범죄·의료·종교) AI 단독 발행 차단

---

## 8. 기술 고려사항 (Technical Considerations)

### 8.1 시스템 아키텍처

**현재 아키텍처:**
- `taeannews.co.kr` — 엔디소프트 CMS 기반 뉴스/커뮤니티 사이트, 회원·광고 자산 보유

**제안 변경:**
- 신규 도메인 `insight.taeannews.co.kr`을 Next.js + FastAPI/NestJS 기반으로 신축
- 두 도메인 간 SSO와 데이터 Sync로 Hybrid 운영

**3계층 데이터 파이프라인 (v1.8 갱신):**

```
┌───────────────────────────────────────────────────────────────────┐
│ Layer 1: Orchestration  (LangGraph Lite on Cloudflare Workers)   │
│   Hono API → Router → [Prediction Agent | Generation Agent]      │
│   Cloudflare KV 캐시 우선 확인, 미스 시에만 LLM 호출              │
└─────────────────────────────┬─────────────────────────────────────┘
                              ↓
┌───────────────────────────────────────────────────────────────────┐
│ Layer 2: Core Processing & Data                                  │
│  • Hybrid LLM (Anthropic Batch API + Together AI Solar Mini)     │
│  • PGVector (외부 Postgres + Hyperdrive) — RAG                   │
│  • Lite Knowledge Graph (Neo4j / NetworkX)                       │
│  • 콘텐츠 3등급 분류 (Critical / Community / Personal)            │
└─────────────────────────────┬─────────────────────────────────────┘
                              ↓
┌───────────────────────────────────────────────────────────────────┐
│ Layer 3: Infrastructure & Quality Control (v1.8)                 │
│  • Cloudflare Workers (Edge runtime, 콜드 스타트 ~24ms)          │
│  • Cloudflare KV (캐시) · Queues + Workers cron (배치)           │
│  • Cloudflare D1 또는 외부 Postgres (Phase 2C 결정)              │
│  • HITL 검토 워크플로 (편집자 검토 단계)                          │
│  • 비용 모니터링 + 서킷 브레이커 (월 30만원 가드)                │
└───────────────────────────────────────────────────────────────────┘
```

**다이어그램 (전체 시스템, v1.8):**

```
                    ┌──────────────────────────────┐
                    │   taeannews.co.kr (기존)     │
                    │   엔디소프트 CMS              │
                    └──────────────┬───────────────┘
                                   │ SSO + Sync API
                                   ▼
┌──────────────┐         ┌──────────────────────────────────────────┐
│  Browser /   │ ───────▶│  insight.taeannews.co.kr                 │
│  Mobile      │         │  Next.js + OpenNext on Cloudflare        │
│  (Web Push)  │         │  (/me 초개인화 · B2C/B2B/B2G · 3등급 노출)│
└──────┬───────┘         └──────────────┬───────────────────────────┘
       │ Web Push                       │
       │                    ┌───────────▼─────────────┐
       │                    │   Hono API (Workers)    │
       │                    │   Edge runtime ~24ms    │
       │                    └─┬─────────┬─────────────┘
       │                      │         │
       │          ┌───────────▼─┐   ┌───▼──────────────────┐
       │          │ LangGraph   │   │ Postgres + PGVector  │
       │          │ Lite Router │   │ (Hyperdrive) +       │
       │          └─┬─────────┬─┘   │ Lite KG (Neo4j)      │
       │            │         │     │ + D1 (메타데이터)    │
       │  ┌─────────▼─┐   ┌───▼─────┐└──────────────────────┘
       │  │Prediction │   │Generation│
       │  │  Agent    │   │  Agent   │
       │  └─────┬─────┘   └────┬─────┘
       │        │              │
       │        └──────┬───────┘
       │               ▼
       │   ┌──────────────────────────────────┐
       │   │ Hybrid LLM (v1.2 / v1.8 유지)    │
       │   │ • Anthropic Claude Batch API     │
       │   │   (비동기·50% 할인)              │
       │   │ • Together AI Solar Mini         │
       │   │   (실시간·한국어)                │
       │   └──────────────────────────────────┘
       │
       │   ┌──────────────────────────────────┐
       │   │ Cloudflare KV (캐시)             │
       │   │  - 응답 캐시 (≥ 75% hit)         │
       │   │  - 세션 / 속도 제한              │
       │   └──────────────────────────────────┘
       │
       │   ┌──────────────────────────────────┐
       │   │ Cloudflare Queues + Workers cron │
       │   │  - 주간 리포트 배치              │
       │   │  - 일일 사전생성                 │
       │   │  - 데이터 인덱싱·임베딩          │
       │   └──────────────────────────────────┘
       │
       │   ┌──────────────────────────────────┐
       └──▶│ Web Push Service (W3C 표준)      │
           │  - VAPID 키 직접 운영            │
           │  - Firebase/FCM 미사용           │
           └──────────────────────────────────┘
```

**핵심 컴포넌트 (v1.8):**
1. **Hono API on Cloudflare Workers** — Edge runtime, 콜드 스타트 ~24ms, 프론트·백엔드 TS 통일
2. **LangGraph Lite Router** — 질의 분류·라우팅, LLM 호출 최소화
3. **Hybrid LLM** — Anthropic Claude Batch API(비동기·50% 할인) + Together AI Solar Mini(실시간·한국어)
4. **PGVector RAG** — 20년치 기사 + 공공 데이터 임베딩 (외부 Postgres + Hyperdrive)
5. **Lite Knowledge Graph** — 장소·인물·사건 엔티티 관계 (Neo4j / NetworkX)
6. **Cloudflare KV** — 응답 캐시(≥75% hit)·세션·속도 제한
7. **Cloudflare Queues + Workers cron** — 주간 리포트·일일 사전생성·임베딩 배치
8. **Cloudflare D1 / 외부 Postgres** — 메타데이터·트랜잭션 저장소 (Phase 2C 확정)
9. **HITL Workflow** — 편집자 검토 단계 강제, 콘텐츠 3등급 분류
10. **Web Push (W3C 표준)** — Firebase/FCM 미사용, VAPID 직접 구현
11. **비용 모니터링 + 서킷 브레이커** — 월 30만원 가드, `cost_events` 집계

### 8.2 API 명세 (대표 엔드포인트)

#### 자연어 질의 (AI Query Agent)
```http
POST /api/v1/query
Authorization: Bearer {jwt}
Content-Type: application/json

{
  "query": "다음 주 안면도 미세먼지 예보 알려줘",
  "context": {
    "domain": "environment",
    "location": "anmyeon"
  }
}

200 OK:
{
  "answer": "다음 주(2026-12-08~14) 안면도 미세먼지 예보는...",
  "sources": [
    {"title": "환경부 대기질 예보", "url": "...", "publishedAt": "2026-12-04"}
  ],
  "aiLabel": "ai_assisted",
  "fromCache": true,
  "responseTimeMs": 320,
  "tokensUsed": 0,
  "remainingQuota": 4
}
```

#### 주간 인사이트 리포트 조회
```http
GET /api/v1/reports/weekly?week=2026-W49
Authorization: Bearer {jwt}

200 OK:
{
  "weekId": "2026-W49",
  "publishedAt": "2026-12-05T09:00:00+09:00",
  "summary": "...",
  "sections": [
    {"title": "관광·기상 예측", "content": "...", "charts": [...]},
    {"title": "환경 모니터링", "content": "...", "charts": [...]}
  ],
  "pdfUrl": "/api/v1/reports/weekly/2026-W49.pdf",
  "premiumOnly": true
}
```

#### B2B 대시보드 데이터
```http
GET /api/v1/dashboards/b2b?location=anmyeon&period=week
Authorization: Bearer {jwt}

200 OK:
{
  "asOf": "2026-12-05T07:00:00+09:00",
  "metrics": {
    "tourismForecast": {...},
    "weather": {...},
    "realEstate": {...},
    "competition": {...}
  }
}
```

#### 시민기자 기사 작성 (Co-Pilot)
```http
POST /api/v1/citizen/articles/{id}/assist
Authorization: Bearer {jwt}
Content-Type: application/json

{
  "action": "polish",          // "factcheck" | "summarize" | "polish" | "title" | "cite"
  "text": "원본 문장..."
}

200 OK:
{
  "original": "원본 문장...",
  "suggestion": "다듬은 문장...",
  "aiLabel": "ai_assisted",
  "tokensUsed": 320
}
```

### 8.3 데이터베이스 스키마 (주요 테이블)

```sql
-- 사용자 (taeannews 계정과 SSO 연동)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  taean_account_id VARCHAR(100),         -- taeannews.co.kr 외래 식별자
  role VARCHAR(30) NOT NULL DEFAULT 'b2c_basic',
  region VARCHAR(50),                    -- 읍·면 코드
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 구독 (B2C/B2B)
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  plan VARCHAR(30) NOT NULL,             -- 'b2c_basic', 'b2c_premium', 'b2b_basic', 'b2b_premium'
  status VARCHAR(20) NOT NULL,           -- 'active', 'paused', 'cancelled'
  started_at TIMESTAMP NOT NULL,
  current_period_end TIMESTAMP,
  pg_subscription_id VARCHAR(100),
  monthly_price_krw INT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 주간 리포트
CREATE TABLE weekly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id VARCHAR(10) UNIQUE NOT NULL,   -- '2026-W49'
  published_at TIMESTAMP NOT NULL,
  summary TEXT,
  sections JSONB NOT NULL,
  pdf_path TEXT,
  ai_label VARCHAR(20) NOT NULL,
  hitl_reviewer_id UUID,
  hitl_reviewed_at TIMESTAMP
);

-- AI 콘텐츠 라벨 추적
CREATE TABLE ai_content_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type VARCHAR(30) NOT NULL,    -- 'report', 'qa', 'article'
  resource_id UUID NOT NULL,
  ai_label VARCHAR(20) NOT NULL,         -- 'ai_generated', 'ai_assisted', 'human'
  model_used VARCHAR(50),
  hitl_reviewer_id UUID,
  hitl_reviewed_at TIMESTAMP,
  sources JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 시민기자 기사
CREATE TABLE citizen_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES users(id),
  status VARCHAR(20) NOT NULL,           -- 'draft', 'submitted', 'reviewing', 'published', 'rejected'
  title TEXT,
  body TEXT,
  ai_assist_log JSONB,                   -- AI 보조 사용 이력
  editor_id UUID,
  reviewed_at TIMESTAMP,
  published_at TIMESTAMP,
  fee_krw INT,                           -- 5만~10만원
  created_at TIMESTAMP DEFAULT NOW()
);

-- 콘텐츠 가시성 등급 (v1.8 신규)
-- 모든 발행 콘텐츠(report·article·qa·widget)에 부여
CREATE TYPE content_visibility_tier AS ENUM (
  'critical',     -- 관심사 무관 모든 사용자 노출 (적조·태풍·대형 사고)
  'community',    -- 관심 분야 불일치 시도 작게 노출 (군수·군의회)
  'personal'      -- 관심사 일치 시만 노출 (펜션 추천·일상 정보)
);

-- 초개인화 사용자 설정 (v1.7 신규)
CREATE TABLE user_preferences (
  user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  segment        VARCHAR(20) NOT NULL,           -- 'b2c_basic' | 'b2c_premium' | 'b2b_basic' | 'b2b_premium' | 'b2g'
  regions        TEXT[] NOT NULL DEFAULT '{}',   -- 읍·면 코드 배열
  categories     TEXT[] NOT NULL DEFAULT '{}',   -- tourism | environment | realestate | policy | industry | culture
  notification_channels TEXT[] NOT NULL DEFAULT '{}',   -- email | webpush | kakao
  onboarded_at   TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT NOW()
);

-- 즐겨찾기 (장소·이벤트·리포트)
CREATE TABLE user_favorites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  kind         VARCHAR(20) NOT NULL,             -- 'place' | 'event' | 'report'
  ref_id       VARCHAR(100) NOT NULL,            -- 외래 식별자 (place_id 등)
  metadata     JSONB,
  created_at   TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, kind, ref_id)
);

CREATE INDEX idx_user_favorites_user ON user_favorites(user_id);

-- 푸시 구독 (Web Push 엔드포인트)
CREATE TABLE notification_subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  channel       VARCHAR(20) NOT NULL,            -- 'webpush' | 'email' | 'kakao'
  endpoint      TEXT NOT NULL,                    -- Web Push endpoint URL or email or kakao_uid
  p256dh_key    TEXT,                             -- Web Push only
  auth_key      TEXT,                             -- Web Push only
  enabled       BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, channel, endpoint)
);

CREATE INDEX idx_notif_subs_user_enabled ON notification_subscriptions(user_id) WHERE enabled = TRUE;

-- B2G 부서 공유 공간 (v1.7 신규)
CREATE TABLE b2g_organizations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(100) NOT NULL,         -- '태안군청 관광과' 등
  org_type        VARCHAR(30) NOT NULL,          -- 'county' | 'eup_myeon' | 'education' | 'research'
  contract_at     DATE,
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE b2g_memberships (
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  org_id       UUID REFERENCES b2g_organizations(id) ON DELETE CASCADE,
  role         VARCHAR(20) NOT NULL DEFAULT 'member',   -- 'admin' | 'member'
  joined_at    TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, org_id)
);

-- 비용 이벤트 (모니터링)
CREATE TABLE cost_events (
  id BIGSERIAL PRIMARY KEY,
  event_at TIMESTAMP DEFAULT NOW(),
  category VARCHAR(30) NOT NULL,         -- 'llm_inference', 'gpu_compute', 'external_api', 'storage'
  vendor VARCHAR(30),
  amount_krw NUMERIC(10, 2) NOT NULL,
  metadata JSONB
);

CREATE INDEX idx_cost_events_month ON cost_events(date_trunc('month', event_at));
```

### 8.4 기술 스택

**프론트엔드:**
- Next.js 14+ (App Router), TypeScript
- Tailwind CSS, shadcn/ui
- Recharts 또는 Apache ECharts (차트)
- TipTap (시민기자 에디터)

**백엔드 (v1.8 결정):**
- **Hono + TypeScript on Cloudflare Workers** (Edge runtime, 콜드 스타트 ~24ms)
- 이유: 프론트와 언어 통일, Cloudflare 무료 한도 활용, OpenNext 어댑터와 일관, 자립 인프라 기조
- 영구 저장소: 초기 인메모리 PoC → Cloudflare D1 또는 외부 Postgres(+Hyperdrive) 중 선택 (Phase 2C 결정)
- 캐시: Cloudflare KV
- 배치: Cloudflare Queues + Workers cron
- LLM 오케스트레이션: LangGraph 가벼운 구성 (Lite Router + 2 Expert Agent) — Phase 1 벤치마크 후 확정
- 필요 시 RAG 인프라(PGVector)는 별도 Postgres 인스턴스로 분리

**AI/ML:**
- vLLM 또는 TGI (추론 서버)
- Solar-10.7B (1차), Llama-3.1-8B (2차) — GPTQ 4bit
- BGE-M3-Korean 또는 KURE-v1 (임베딩)
- Neo4j 또는 NetworkX (Lite KG)

**인프라:**
- Docker + docker-compose (단일 호스트 운영)
- 클라우드: AWS g5.xlarge 또는 자체 PC (RTX 4090)
- CI/CD: GitHub Actions
- 모니터링: Grafana + Prometheus + Sentry
- 백업: 일일 Postgres dump → S3 호환 스토리지

### 8.5 외부 의존성

| 서비스 | 목적 | 비용/한도 | 폴백 |
|-------|------|---------|------|
| 한국관광공사 TourAPI | 관광지·방문객 데이터 | 무료 (할당량 주의) | 캐시된 직전 데이터 |
| 기상청 OpenAPI | 기상·해양 예보 | 무료 | 캐시 |
| 해양수산부 OpenAPI | 해양환경 | 무료 | 캐시 |
| KOSIS | 인구·부동산 통계 | 무료 | 캐시 |
| KG이니시스/토스페이먼츠 | PG 결제 | 거래 수수료 약 3% | 다른 PG 이중화 |
| Twilio/Kakao 알림톡 | SMS/카톡 알림 | 건당 비용 | 이메일로 대체 |
| AWS S3 또는 NCloud Object Storage | 파일·백업 | 사용량 기반 | 자체 NAS |
| Sentry | 에러 모니터링 | 무료 티어 | 자체 로그 |

**내부 의존성:**
- `taeannews.co.kr` (엔디소프트 CMS) — Sync API 또는 RSS 피드 필요
- 엔디소프트의 인프라 지원 (협력 기관)

### 8.6 마이그레이션 전략

본 사업은 **신규 구축**이므로 마이그레이션 부담은 작으나, 다음 단계를 통해 점진 배포:

1. **Phase 1: 인프라 준비 (5월)** — GPU 인스턴스, Postgres, Redis, 도메인 등록
2. **Phase 2: 코어 개발 (7~9월)** — 모든 P0 기능 개발 + 비용 검증
3. **Phase 3: 내·외부 베타 (10~11월)** — 한정 사용자 대상 베타
4. **Phase 4: 정식 런칭 (12월)** — 마케팅·B2B 영업 본격화

**기존 taeannews.co.kr 영향 최소화:**
- 별도 도메인이므로 기존 사이트 다운타임 0
- 크로스 프로모션 배너만 점진 노출 (A/B 테스트)

**롤백 계획:**
- 신규 도메인 일시 비활성화로 즉시 격리 가능
- 결제·구독은 PG 측 환불 정책 따름

### 8.7 테스트 전략

**단위 테스트 (> 70% 커버리지)**
- Router 분류, 캐시 키 정규화, PII 마스킹, AI 라벨 부착, 비용 계산

**통합 테스트**
- 자연어 질의 전 흐름 (Router → Agent → 캐시 → 응답)
- 주간 리포트 배치 잡 E2E
- 결제·구독 라이프사이클

**E2E 테스트 (Playwright)**
- 회원가입 → 구독 → 리포트 조회 → 해지
- 시민기자 작성 → AI 보조 → 검토 → 발행
- B2B 대시보드 접근 → CSV 내보내기

**성능 테스트**
- 동시 200 req/sec 부하 (k6)
- 추론 서버 단독 부하 (vLLM 벤치마크)

**보안 테스트**
- OWASP Top 10, KISA 점검 가이드
- PII 마스킹 회귀 테스트

**AI 품질 테스트**
- 자체 도메인 평가셋 500문항 (정확도·환각률·출처 적합성)
- 시민기자 사용성 테스트 (UAT)

---

## 9. 구현 로드맵 (Implementation Roadmap)

본 로드맵은 사업계획서의 4단계 7개월 일정(2026-05-18 ~ 2026-12-15)을 따른다.

### Phase 1: 설계 및 운영비 검증 (M1~M2 · 2026-05~06)
**목표:** 경량 아키텍처 설계, 월 30만원 운영비 검증, 기술 요구사항 확정

**태스크:**
- [ ] Task 1.1: GPU 인스턴스 후보 비교(자체 PC vs AWS g5.xlarge vs NCloud) — Small (4h)
- [ ] Task 1.2: 모델 후보 벤치마크 (Solar/Llama 8B/14B) — Medium (8h)
- [ ] Task 1.3: 양자화(GPTQ 4bit) 변환 및 추론 시간 측정 — Medium (6h)
- [ ] Task 1.4: 한국어 평가셋 500문항 구축 — Medium (8h)
- [ ] Task 1.5: 캐시 키 정규화 PoC — Small (3h)
- [ ] Task 1.6: 월 30만원 비용 모델 시뮬레이션 — Medium (5h)
- [ ] ~~Task 1.7: 시민기자 모집 공고·선발~~ → **Phase 2C로 이전 (v1.5, 2026-07 중순)**
- [ ] Task 1.8: insight 도메인 등록·DNS·HTTPS — Small (2h)
- [ ] Task 1.9: 기술 요구사항 문서(SRS) 확정 — Medium (8h)

**검증 체크포인트:** 단일 GPU + 캐시로 월 30만원 이내 운영 가능성 입증 (시뮬레이션 결과 보고)

---

### Phase 2: 개발 및 비용 최적화 (M3~M5 · 2026-07~09)
**목표:** P0 요구사항 전부 구현, 캐싱 히트율 75% 달성, 데이터 파이프라인 가동

**Sub-Phase 2A: 데이터 파이프라인 (7월)**
- [ ] Task 2.1: 20년치 자체 기사 크롤링·OCR — Large (16h)
- [ ] Task 2.2: 공공 API 수집 파이프라인 (TourAPI/기상청/해수부/KOSIS) — Medium (10h)
- [ ] Task 2.3: 임베딩 + PGVector 인덱싱 — Medium (8h)
- [ ] Task 2.4: Lite KG 엔티티 추출 — Medium (10h)

**Sub-Phase 2B: AI Core Engine (7~8월)**
- [ ] Task 2.5: vLLM/TGI 추론 서버 도커화 — Medium (6h)
- [ ] Task 2.6: LangGraph Lite Router 구현 — Medium (8h)
- [ ] Task 2.7: Prediction Agent / Generation Agent — Large (14h)
- [ ] Task 2.8: 캐시 레이어 (Redis) 구현 — Medium (6h)
- [ ] Task 2.9: 사전 생성 배치 잡 (Top-N 200건) — Medium (5h)
- [ ] Task 2.10: 비용 모니터링·서킷 브레이커 — Medium (8h)

**Sub-Phase 2C: 플랫폼 & 상품 (8~9월)**
- [ ] Task 2.11: Next.js 프론트엔드 부트스트랩 + 디자인 시스템 — Medium (8h)
- [ ] Task 2.12: 인증·SSO·결제 통합 — Large (12h)
- [ ] Task 2.13: 주간 리포트 발행 시스템 — Medium (10h)
- [ ] Task 2.14: AI Query Agent UI — Medium (8h)
- [ ] Task 2.15: B2B 기본 대시보드 — Medium (10h)
- [ ] Task 2.16: 시민기자 Co-Pilot 에디터 — Large (16h)
- [ ] Task 2.17: HITL 검토 워크플로 — Medium (8h)
- [ ] Task 2.18: AI 윤리·거버넌스 가드(라벨/PII/민감주제) — Medium (10h)

**Sub-Phase 2D: 시민기자 모집·교육 (v1.5 일정 조정: 7월 중순~8월)**
- [ ] Task 2.19a: 시민기자 모집 공고문·지원서 양식 작성 (6월 말 완료) — Small (6h, 사업 운영)
- [ ] Task 2.19b: 시민기자 모집·면접·선발 12명 (7월 둘째 주 ~ 7월 셋째 주) — Medium (12h, 사업 운영)
- [ ] Task 2.19c: 6회 교육 프로그램 커리큘럼·교재 (사전 준비 6~7월, 진행 7월 말~8월) — Medium (12h, 사업 운영)
- [ ] Task 2.20: 교육 LMS 모듈(영상·과제) — Medium (5h)

**시민기자 운영 일정 (v1.5):**
| 단계 | 기간 | 작업 |
|---|---|---|
| 준비 | 6월 말 | 공고문·지원서·평가 기준 확정 |
| 모집·선발 | 7월 중순 (2주) | 공고 게재·접수·면접·12명 선발 |
| 교육 | 7월 말 ~ 8월 (6주) | 6회 교육 + AI Co-Pilot 실습 |
| 활동·발행 | 9월 ~ 11월 (3개월) | 1인당 월 4~6편, 총 12~18편 |
| 평가 | 12월 | 우수 기자 시상 30만원 |

**검증 체크포인트:**
- 캐시 히트율 ≥ 75%
- 평가셋 정확도 ≥ 70%
- 월 30만원 이내 운영비 (실측 30일)

---

### Phase 3: 베타 테스트 및 영업 (M6~M7 · 2026-10~11)
**목표:** 내·외부 베타, 시민기자 파일럿, 사전 B2B 영업

**태스크:**
- [ ] Task 3.1: 내부 알파 테스트 (편집부·주관사) — Small (5h)
- [ ] Task 3.2: 외부 베타 (100명 한정) — Medium (8h)
- [ ] Task 3.3: 시민기자 파일럿 발행 (1인당 2편) — Medium (10h)
- [ ] Task 3.4: 사전 B2B 영업 (펜션·체험업체·공공) 30개 컨택 — Large (20h)
- [ ] Task 3.5: 피드백 반영 및 버그 수정 — Medium (16h)
- [ ] Task 3.6: 성능·보안 점검 (외부 감사 옵션) — Medium (8h)

**검증 체크포인트:**
- 베타 만족도 NPS > 30
- 시민기자 4편/월 도달 가능성 확인
- 사전 B2B 의향 LOI 10개+

---

### Phase 4: 정식 서비스 런칭 (M7 · 2026-12)
**목표:** 정식 런칭, KPI 달성 측정, 사용자 피드백 수집

**태스크:**
- [ ] Task 4.1: 런칭 마케팅 (SNS·인플루언서·기존 사이트 배너) — Medium (10h)
- [ ] Task 4.2: 1차 KPI 측정 (MRR, 유료, MAU, 캐시 히트율) — Small (4h)
- [ ] Task 4.3: 시민기자 연간 성과 평가·인센티브 지급 — Small (4h)
- [ ] Task 4.4: 결과 보고서 작성 (지역신문발전위원회 제출) — Medium (10h)
- [ ] Task 4.5: 2027년 캐싱 고도화 로드맵 수립 — Small (4h)

**검증 체크포인트:** 12월 말 기준 KPI 4종 달성률 보고

---

### 태스크 의존성 시각화

```
Phase 1 (설계):
  1.1, 1.2 → 1.3 → 1.4 → 1.6 (비용 검증)
  1.5 (캐시 PoC, 병렬)
  1.7 (시민기자 모집, 병렬)

Phase 2:
  2A (데이터): 2.1, 2.2 → 2.3 → 2.4
  2B (AI Core): 2.5 → 2.6 → 2.7 → 2.8 → 2.9, 2.10
  2C (플랫폼): 2.11 → 2.12 → (2.13 || 2.14 || 2.15 || 2.16)
                → 2.17 → 2.18
  2D (교육, 병렬): 2.19 → 2.20

Phase 3 (베타):
  Phase 2 → 3.1 → 3.2 → (3.3 || 3.4) → 3.5 → 3.6

Phase 4 (런칭):
  Phase 3 → 4.1 → 4.2 → 4.3 → 4.4 → 4.5

임계 경로:
  1.2 → 1.3 → 2.5 → 2.6 → 2.7 → 2.13 → 2.18 → 3.2 → 3.5 → 4.1 → 4.2
```

### 노력 추정 & 예산 정합성

**기술 개발 시간 (개발자 기준):**
- Phase 1: 약 60h
- Phase 2: 약 230h
- Phase 3: 약 65h
- Phase 4: 약 30h
- **총: ~385h** (Senior 개발자 1명 풀타임 ~3개월 + 보조 인력)

**예산 정합성 (총 50,000,000원, v1.9 재배분):**

| 항목 | v1.0 (원안) | v1.3 | v1.9 (재배분) | Δ(v1.3→v1.9) | 비율 | 매핑된 PRD 영역 |
|------|------|------|------|---|------|--------------|
| AI Core Engine 개발 | 15,500,000원 | 17,500,000원 | **19,000,000원** | **+1,500,000** | 38% | REQ-AI-001~003, REQ-INFRA-001 (Hybrid Router·프롬프트·캐시) |
| 플랫폼 개발 & Hybrid | 12,500,000원 | 12,500,000원 | **14,000,000원** | **+1,500,000** | 28% | REQ-PLATFORM-001~003 (`/me` 초개인화·B2G·Hybrid Sync 보강) |
| Citizen Co-Pilot & 교육 | 7,000,000원 | 7,000,000원 | **5,500,000원** | **−1,500,000** | 11% | REQ-CITIZEN-001 (모집 3개월 단축 반영) |
| 데이터 수집·인프라 | 6,000,000원 | 3,000,000원 | 3,000,000원 | 0 | 6% | REQ-DATA-001~002 |
| 마케팅·B2B 영업 | 6,000,000원 | 7,000,000원 | **5,500,000원** | **−1,500,000** | 11% | Phase 3~4 (베타 인센티브 조정) |
| PM·교육·Contingency | 3,000,000원 | 3,000,000원 | 3,000,000원 | 0 | 6% | 전 Phase 관리 |
| **합계** | **50,000,000원** | **50,000,000원** | **50,000,000원** | **0** | **100%** | |

**재배분 요약 (v1.9, 2026-05-29):**
- **AI Core Engine +150만** → 누적 1,900만 (38%). Hybrid LLM 라우터·프롬프트·평가 파이프라인 강화에 재투입. 사업계획서 "AI 기술 투자 56%" 방향성과 더 정합
- **플랫폼·Hybrid +150만** → 1,400만 (28%). v1.7~1.8에서 추가된 `/me` 초개인화, B2G 세그먼트, Cloudflare Workers + OpenNext 배포, 콘텐츠 3등급 분류 구현분 보강
- **Citizen Co-Pilot & 교육 −150만** → 550만 (11%). v1.5에서 활동 기간이 6개월→3개월(9~11월)로 단축되고 1인당 발행량 목표가 12~18편으로 축소된 점 반영
- **마케팅·B2B 영업 −150만** → 550만 (11%). 베타 인센티브·캠페인 규모 재조정 (B2C 자연 유입과 SSO 크로스 프로모션 가중)
- GPU 자체 PC 구매(400만원) 제거 결정(v1.2)은 그대로 유지 — 데이터 수집·인프라 300만원, 평가셋 강화분 포함

---

## 10. 범위 외 (Out of Scope)

이번 v1.0(2026년 사업)에 명시적으로 **포함되지 않는** 것:

1. **네이티브 모바일 앱 (iOS/Android)**
   - 이유: 7개월·5천만원 예산 한계, 웹 반응형으로 충분
   - 향후: 2027년 PWA → 2028년 네이티브 검토

2. **실시간 Multi-Agent 구조**
   - 이유: 본 사업의 핵심 가치(비용 절감)와 정면 충돌
   - 대안: 캐싱 + 배치 + 경량 Router로 동등 가치 제공

3. **도메인 특화 LLM 파인튜닝**
   - 이유: 비용·데이터 라벨링 부담
   - 향후: 2028년 (사업계획서 장기 로드맵)

4. **인근 지역신문 연합 (서산·당진·홍성)**
   - 이유: 멀티테넌트 아키텍처 필요, 본 사업은 태안 검증이 우선
   - 향후: 2030년 충남 서해안 AI Hub

5. **하드웨어 보안 키·생체 인증**
   - 이유: 일반 사용자 수요 낮음, 보안 위협 모델 단순

6. **자체 결제 PG 직접 구축**
   - 이유: KG이니시스/토스페이먼츠로 충분, PCI DSS 부담 회피

7. **AI 단독 발행**
   - 이유: AI 윤리 원칙 — HITL 검토 강제

8. **민감 주제 자동 보도 (선거·범죄·의료·종교)**
   - 이유: AI 단독 판단 위험, 사회적 영향
   - 대안: 인간 기자 직접 작성, AI는 자료 정리만 보조

9. **광고 자동 게재(프로그래매틱)**
   - 이유: 본 사업은 구독·B2B 위주, 광고는 기존 taeannews.co.kr가 담당
   - v1.0 매출 중 광고 비중은 4%로 제한적

10. **B2C 무료 사용자 무제한 AI Query**
    - 이유: 비용 통제, 일 5회 제한으로 유료 전환 동기 부여

---

## 11. 경쟁 분석 (Competitive Analysis)

### 11.1 경쟁/비교 대상

| 기준 | 우리 (insight.taeannews) | 평택시민신문 | 당진시대신문 AI 아카이브 | 한국언론진흥재단 PressBOT | 일반 포털 (네이버·다음) |
|-----|---|---|---|---|---|
| 지역 특화 | ⭐⭐⭐⭐⭐ (태안 한정) | ⭐⭐⭐ | ⭐⭐⭐⭐ (당진) | ⭐⭐ | ⭐ |
| AI 예측 인사이트 | ⭐⭐⭐⭐⭐ (관광·환경·부동산) | ⭐⭐ | ⭐⭐⭐ (아카이브 중심) | ⭐⭐⭐ | ⭐ |
| 비용 효율 (월 운영비) | ⭐⭐⭐⭐⭐ (30만원) | ⭐⭐ | ⭐⭐ (추정) | N/A | N/A |
| 시민 참여 (시민기자) | ⭐⭐⭐⭐⭐ (12명 + Co-Pilot) | ⭐⭐⭐ | ⭐⭐ | ⭐ | ⭐ |
| HITL 품질 보증 | ⭐⭐⭐⭐⭐ (100%) | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐ |
| 접근성 (고령자·장애인) | ⭐⭐⭐⭐⭐ ((주)엔씨투 전문성) | ⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| B2B 수익 모델 | ⭐⭐⭐⭐ (대시보드·API) | ⭐ | ⭐⭐ | N/A | N/A |

### 11.2 SWOT

**강점 (Strengths):**
- 캐싱·배치·경량 모델 3축으로 **타사 대비 70%+ 비용 절감**
- 태안 특화 데이터(20년 기사 + 공공 데이터)로 일반 LLM이 못 따라잡는 지역 깊이
- (주)엔씨투의 20년 접근성 SW 전문성 — 고령자 친화 UI
- 시민기자단으로 **풀뿌리 저널리즘 + AI** 결합 차별화

**약점 (Weaknesses):**
- 자체 호스팅 Quantized LLM의 한국어 품질이 상용 LLM 대비 낮을 위험
- 단일 지역(태안)이라 절대 시장 규모 제한
- 신규 도메인이라 SEO·브랜드 인지도 초기 부재

**기회 (Opportunities):**
- 2026년 한국어 Quantized 모델(Solar 등) 품질 임계점 도달
- 태안 관광·환경 수요 상승세
- 지역신문발전위원회 보조사업·지자체 협업 가능성
- 패스키·서해안 AI Hub 등 2030 로드맵 확장 잠재력

**위협 (Threats):**
- 대형 포털/언론사의 지역 AI 서비스 진입
- 상용 LLM 가격 급락 시 자체 호스팅 우위 약화
- B2B 영업 지연 시 MRR 1,500만원 미달 가능성
- 시민기자 이탈·교육 효과 부족 위험

### 11.3 차별화 전략

1. **"태안만의 깊이"** — 20년치 자체 아카이브 + 공공 데이터 결합으로 일반 LLM이 모르는 지역 컨텍스트
2. **"30만원의 약속"** — 월 운영비 30만원 이내라는 정량 약속, 다른 지역신문에 오픈소스 노하우 공유 (2028 모델)
3. **"시민이 함께 만드는 AI 저널리즘"** — Co-Pilot + HITL로 단순 자동화가 아닌 풀뿌리 강화
4. **"누구나 읽을 수 있는 AI"** — WCAG AA + 고령자 친화 UI로 정보 격차 해소
5. **"공공 데이터의 가치 환원"** — 무료 공공 데이터를 지역 의사결정 인사이트로 가공·재유통

---

## 12. 미해결 질문 & 리스크 (Open Questions & Risks)

### 12.1 미해결 질문

#### ~~Q1: 최종 LLM 선정~~ → **Phase 1 벤치마크로 결정 (2026-05-26 합의)**
- **상태:** **확정 — Phase 1 벤치마크 기반 결정**
- **수행:** Solar-10.7B / Llama-3.1-8B / Llama-3.1-14B 3종을 한국어 평가셋 500문항으로 동시 측정
- **결정 기준:** 정확도 ≥ 70% 통과한 모델 중 (추론 속도 + 비용) 종합 1순위
- **마감:** 2026-06-15
- **담당:** AI 엔지니어 + 디지털전환 총괄

#### ~~Q2: GPU 인프라~~ → **Hybrid API 재결정 (2026-05-26 v1.2)**
- **상태:** **재확정 — 외부 API Hybrid (자체 PC 결정 철회)**
- **구성:** Anthropic Batch API (비동기·50% 할인) + Together AI Solar Mini (실시간·한국어)
- **이유:**
  - 초기 투자 400만원 → 0원
  - 24h 장비 운영·장애 대응 부담 제거
  - idle 비용 0원 (실패 시 회수 부담 없음)
  - 사업계획서 "저비용 GPU 인스턴스 **또는** 자체 고사양 PC" 표현 안에 포함 (정합성 유지)
- **새 리스크:** 외부 API 의존성·가격 변동 — Together AI 가격 인상 시 DeepInfra·Modal Serverless로 즉시 전환 가능
- **장기 옵션 (2027+):** 사업 검증 후 자체 호스팅 재검토
- **담당:** AI 엔지니어 + 디지털전환 총괄

#### ~~Q3: 결제 PG~~ → **토스페이먼츠 확정 (2026-05-26)**
- **상태:** **확정 — 토스페이먼츠**
- **이유:** 개발자 친화 API, 구독 빌링키 지원, 정산 주기 짧음, 수수료 약 3%
- **담당:** 풀스택 개발자

#### ~~Q4-NEW: 유료 고객 지표 가중치 정의~~ → **Phase 3 베타 후 재결정 (2026-05-27 확정)**
- **상태:** **확정 — 데이터 기반 재정의 전략**
- **결정:** 2026-11월 Phase 3 외부 베타(100명) 종료 시점에 다음 실측 데이터 기반으로 KPI 재정의
  - B2C 실측 전환율(무료→유료)
  - B2C/B2B별 평균 ARPU
  - Churn 코호트 데이터
- **잠정 작업 가정:** B2B 150개 + B2C 840명 활성 결제자 영업·마케팅 진행
- **Phase 3 종료 시점 결정 옵션:** (a) MRR 단일 KPI 채택, (b) 가중치 KPI 도입, (c) 사업계획서 원안 유지 — 데이터 본 후 선택
- **담당:** 사업 책임자 + 디지털전환 총괄
- **마감:** 2026-11-30 (Phase 3 종료 직후, 사업 결과 보고서 작성 전)

#### ~~Q4-OLD: 시민기자 원고료 정산 주기~~ → **월간 정산 확정 (2026-05-27)**
- **상태:** **확정 — 월간 정산 (매월 말 자동 집계·이체)**
- **구현 사양:**
  - 매월 25일 23:59까지 발행 승인된 기사 자동 집계
  - 매월 말일 원고료 계산 (편당 5~10만원, 우수 보너스 별도)
  - 익월 5영업일 이내 자동 이체
  - 시민기자 마이페이지에서 정산 내역·이체 상태 실시간 확인
- **이유:** 동기·소속감 유지, 이탈 방지 (분기 정산 시 동기 감소 리스크). 자동화로 운영 부담 완화.
- **담당:** 사업 운영 + 백엔드 개발자
- **반영 위치:** REQ-CITIZEN-001, TaskMaster #29 (Contributor Settlement Dashboard)

#### ~~Q5: B2B 가격 정책~~ → **기본 30,000원 / 프리미엄 80,000원 확정 (2026-05-26)**
- **상태:** **확정 — 저가 진입 전략**
- **요구 고객 수:** B2B 기본 120개 + 프리미엄 30개 = **B2B 150개** (+ B2C 840명)
- **리스크:** 사업계획서 "유료 고객 120개" 단순 합산 정의 시 영업 부담 급증 → Q4-NEW로 KPI 가중치 재정의 필요
- **완화 전략:**
  - 기존 태안신문 광고주 네트워크 우선 영업
  - 펜션·체험업체·식당 협회 단체 가입 할인 협상
  - Phase 3 베타에서 가격 탄력성 추가 검증 (인상 가능 여부)
- **담당:** 비즈니스 팀 + 디지털전환 총괄

#### ~~Q6: 민감 주제 차단 기준~~ → **기본 4종 + 확장 3종 확정 (2026-05-27)**
- **상태:** **확정 — 7종 카테고리 차단·HITL 강제**
- **차단 분류 (AI 단독 발행 금지·HITL 검토 강제):**

| # | 카테고리 | 사례 | 처리 방식 |
|---|---|---|---|
| 1 | 선거 | 후보·정당·선거 결과 분석 | AI 단독 발행 차단, 편집장 직접 작성 |
| 2 | 범죄 | 사건·피의자·피해자 | AI 단독 발행 차단, 사실 확인 2단계 |
| 3 | 의료 | 진단·치료·약물 조언 | AI 단독 발행 차단, 의료 전문가 자문 |
| 4 | 종교 | 신앙·종파 비교·논쟁 | AI 단독 발행 차단 |
| 5 | **정치적 인물 언급** (확장) | 시장·군수·국회의원 등 평가 | HITL 필수, 정치 편향 검토 |
| 6 | **부동산 투기 자문** (확장) | 매매·시세 예측 자문 | HITL 필수, 면책 조항 자동 부착 |
| 7 | **소수자 이슈** (확장) | 장애·이주민·성소수자 | HITL 필수, 차별 표현 자동 스캔 |

- **구현:** REQ-GOV-001 민감 주제 분류기 — 키워드 + ML 분류 2중 확인
- **담당:** 편집부 + 법무 자문 + AI 엔지니어
- **반영 위치:** REQ-GOV-001, TaskMaster #27 (AI Ethics & Governance Middleware)

### 12.2 리스크 & 완화

| 리스크 | 가능성 | 영향 | 심각도 | 완화 | 대응 |
|-------|------|-----|------|-----|-----|
| **AI 운영비 30만원 초과** | Medium | High | **Critical** | 캐싱 강화·배치 확대·상용 API 의존 추가 축소, 비용 임계 알림 70/90/100% | 자동 서킷 브레이커, 비필수 호출 차단, 무료 한도 축소 |
| **목표 달성 지연(MRR/MAU)** | Medium | High | **High** | 핵심 기능 우선·출시 범위 단계 조정, 사전 B2B LOI 확보 | Phase 4에 마케팅 예산 집중, 가격 조정 |
| **Quantized 모델 한국어 품질 저하** | Medium | High | **High** | 평가셋 500문항 사전 검증, 도메인 파인튜닝 옵션, HITL 검토 강화 | 보조 모델(Llama 14B) 전환, 일부 호출만 상용 API 잠정 사용 |
| **B2B 유료 고객 확보 지연** | **High** | High | **High** | 저가 진입(기본 3만/프리미엄 8만)으로 진입 장벽 낮춤, 기존 태안신문 광고주 네트워크 우선 영업, 협회 단체 가입 할인, 14일 무료 체험 | 단가 인상 가능성 검증, 데이터·API 판매 강화, B2C 비중 증대 |
| **저가 정책으로 인한 영업 부담 증가** (NEW) | High | High | **High** | B2B 150개 확보 필요 — 사업계획서 120개 대비 +30개. 영업 자원 집중 + 협회·공공기관 일괄 영업 | KPI 가중치 재정의(Q4-NEW), 단가 인상 시점 검토 |
| **시민기자 이탈** | Medium | Medium | **Medium** | 인센티브 30만원 + 우수자 시상, 동료 커뮤니티, 멘토링 | 예비 후보 풀 확보(3명), 활동 연장 의향 조사 |
| **공공 API 변경·중단** | Low | Medium | **Medium** | 다중 출처(TourAPI·기상청·해수부·KOSIS), 캐시된 데이터 폴백 | 대안 API 즉시 전환 매뉴얼 |
| **외부 LLM API 장애 (Together AI 또는 Anthropic)** | Low | High | **Medium** | 두 벤더 분리 운영(한쪽 장애 시 다른 쪽 우회), 캐시 응답으로 폴백, DeepInfra·Modal 백업 옵션 사전 검증 | 캐시 응답만으로 부분 운영, 24시간 내 대체 API 전환 |
| **외부 LLM API 가격 인상** (NEW v1.2) | Medium | Medium | **Medium** | 매월 단가 모니터링, 토큰 사용량 통제, 2027년 자체 호스팅 옵션 보존 | DeepInfra·Modal Serverless·자체 호스팅으로 전환 |
| **법적 리스크 (개인정보·저작권)** | Low | Critical | **High** | KISA 가이드 준수, 자체 자산만 학습, 외부 인용 출처 강제 | 법무 자문, 즉시 콘텐츠 회수·정정 절차 |
| **무료 사용자가 유료 전환 안 함** | High | Medium | **High** | 무료 한도 매력적 + 명확한 유료 가치 차별화, 7일 체험 | 가격 인하·번들·캠페인 |
| **시민기자 발행물 품질 이슈** | Medium | Medium | **Medium** | 6회 교육·HITL·매월 평가 | 교육 보강, 활동 일시 중단 후 재교육 |
| **엔디소프트 협력 지연** | Low | Medium | **Medium** | 초기 설계에서 의존 최소화, RSS·CSV 백업 채널 | 자체 크롤링으로 임시 대체 |
| **결제 트랜잭션 오류** | Low | High | **Medium** | PG 통합 테스트, Sandbox 충분 검증 | 수동 정산 절차, 환불 SOP |

---

## 13. 릴리즈 기준 (Release Criteria)

### 13.1 정식 런칭(2026-12-15) 전 필수 조건

**기능적 기준:**
- [ ] 모든 P0 요구사항(REQ-AI-001~003, REQ-INFRA-001, REQ-DATA-001, REQ-PLATFORM-001~002, REQ-PRODUCT-001~003, REQ-CITIZEN-001, REQ-GOV-001, REQ-COST-001) 완료
- [ ] 4대 핵심 상품 모두 정상 발행/운영
- [ ] 시민기자 12명 중 10명 이상 1편 이상 발행 경험

**품질 기준:**
- [ ] 단위 테스트 커버리지 ≥ 70%
- [ ] E2E 핵심 시나리오 4종 (구독·질의·대시보드·시민기자) 통과
- [ ] 한국어 평가셋 500문항 정확도 ≥ 70%
- [ ] 캐시 히트율 ≥ 75% (30일 실측)
- [ ] AI 콘텐츠 비율 ≥ 30% (런칭 시점, 12월 말까지 42% 도달)
- [ ] HITL 검토 비율 100%

**운영 기준:**
- [ ] 월 AI 운영비 ≤ 300,000원 (30일 실측)
- [ ] 비용 모니터링 대시보드 + 70/90/100% 알림 작동
- [ ] 백업 자동화 + 1회 이상 복구 리허설
- [ ] 가동률 SLA 99.5% 달성 (베타 기간 측정)

**보안·컴플라이언스:**
- [ ] PII 마스킹 회귀 테스트 통과
- [ ] KISA 개인정보 처리방침 게시
- [ ] HTTPS 강제, TLS 1.3
- [ ] AI 윤리 4대 원칙 코드 가드 작동 확인

**문서화:**
- [ ] OpenAPI 문서
- [ ] 사용자 가이드(B2C·B2B·시민기자)
- [ ] 운영 매뉴얼(장애 대응·롤백 SOP)
- [ ] 지역신문발전위원회 결과 보고서 초안

### 13.2 출시 후 모니터링

**런칭 후 첫 주(12-15 ~ 12-22):**
- 에러율 < 0.5%, 가동률 ≥ 99.0%
- 첫 결제·구독 발생 확인
- 시민기자 발행 흐름 정상 작동
- 비용 일일 모니터링 (이상치 즉시 대응)

**첫 달(12월 말):**
- MRR/MAU/유료 고객 KPI 측정
- 사용자 NPS 설문
- 비용 합산 ≤ 30만원 확인
- 사업 결과 보고서 제출

---

## 14. 검증 체크포인트 (Validation Checkpoints)

### Checkpoint 1: Phase 1 종료 (2026-06-30)
**기준:**
- [ ] LLM 모델 최종 선정 및 양자화 변환 완료
- [ ] GPU 인프라 결정 (자체 PC vs 클라우드)
- [ ] 한국어 평가셋 500문항 구축 완료, 기준 정확도 측정
- [ ] 캐싱 키 정규화 PoC 검증
- [ ] 비용 시뮬레이션으로 월 30만원 달성 가능성 입증
- [ ] 시민기자 12명 선발 완료
- [ ] 기술 요구사항서(SRS) 승인

**실패 시 대응:**
- 모델 품질 미달 → 보조 모델(Llama 14B) 전환 또는 일부 상용 API 잠정 활용
- 비용 시뮬레이션 실패 → 캐시 정책 강화, 배치 처리 확대, 무료 한도 축소
- 시민기자 미달 → 추가 모집 또는 인근 지역 확대

---

### Checkpoint 2: Phase 2A·B 종료 (2026-08-31)
**기준:**
- [ ] 데이터 파이프라인(자체 기사 + 공공 API) 가동
- [ ] PGVector 인덱스 빌드 완료, top-k 응답 ≤ 200ms
- [ ] LangGraph Lite Router + 2 Expert Agents 동작
- [ ] 캐시 레이어 동작, 초기 히트율 측정
- [ ] 비용 모니터링 대시보드 가동
- [ ] AI 윤리 가드(라벨·PII·민감주제) 코드 통합

**실패 시 대응:**
- 캐시 히트율 저조 → 사전 생성 Top-N 확대, TTL 조정
- 추론 지연 → 양자화 단계 강화(4bit), 동시 호출 제한

---

### Checkpoint 3: Phase 2C 종료 (2026-09-30)
**기준:**
- [ ] 프론트엔드 4대 상품 화면 모두 작동 (리포트·Query·B2B·시민기자)
- [ ] 인증·SSO·결제 통합 완료
- [ ] HITL 검토 워크플로 작동
- [ ] 접근성 WCAG AA 자동 검사 통과
- [ ] 시민기자 첫 발행 1건 이상 성공

**실패 시 대응:**
- 결제 통합 지연 → 신용카드만 우선, 카카오페이 등 후순위
- 접근성 미달 → (주)엔씨투 전문 리뷰 추가

---

### Checkpoint 4: Phase 3 종료 (2026-11-30)
**기준:**
- [ ] 외부 베타 100명 NPS > 30
- [ ] 캐시 히트율 ≥ 75% (실측 30일)
- [ ] 월 운영비 ≤ 30만원 (실측 30일)
- [ ] 시민기자 평균 월 3편 도달 가능성 확인
- [ ] 사전 B2B 영업 LOI 10건+ 확보
- [ ] 보안·성능 회귀 테스트 통과

**실패 시 대응:**
- NPS 저조 → 핵심 페인 포인트 우선 수정, 런칭 일정 일부 조정
- B2B LOI 미달 → 가격 조정·번들 제안, 공공기관 영업 강화

---

### Checkpoint 5: 정식 런칭 (2026-12-15)
**기준:**
- [ ] 모든 P0 요구사항 통과 (§13.1)
- [ ] 첫 24시간 무중단 가동
- [ ] 첫 결제 발생
- [ ] 비용 임계 알림 정상 작동

**실패 시 대응:**
- 즉시 롤백 또는 일부 기능 비활성화, 24시간 내 핫픽스

---

### Checkpoint 6: 사업 종료 (2026-12-31)
**기준:**
- [ ] MRR 1,500만원 달성률 보고 (목표 100% 이상이 이상)
- [ ] 유료 고객 120개 달성률 보고
- [ ] MAU 12,000명 달성률 보고
- [ ] AI 콘텐츠 비율 42% 달성
- [ ] Churn ≤ 13% 달성
- [ ] 결과 보고서 제출

**실패 시 대응:**
- 미달 항목별 원인 분석 및 2027년 캐싱 고도화 로드맵에 반영

---

## 15. 실무자 관점 Q&A (Practitioner's Perspective Q&A)

### 개발자 관점 (Developer's Perspective)

**Q1: 이 사업의 가장 큰 기술적 과제는 무엇인가요?**
> A: **월 30만원 운영비 제약 하에서 한국어 LLM 품질 확보**가 최대 과제입니다. 구체적으로:
> - 한국어 Quantized 모델(Solar-10.7B/Llama-3.1-8B 4bit)의 추론 품질이 상용 GPT-4 대비 어디까지 따라잡는지 평가셋 500문항으로 사전 검증
> - 캐시 히트율 75%를 안정적으로 유지하기 위한 키 정규화·TTL·사전 생성 전략
> - 배치 처리와 실시간 호출의 균형 (주간 리포트 = 배치, 사용자 질의 = 캐시 우선 + 미스 시에만 LLM)

**Q2: 기존 taeannews.co.kr CMS와 어떻게 통합하나요?**
> A: 통합 전략:
> - **분리 + 연계** 원칙 — 두 도메인은 코드베이스를 공유하지 않고 API/SSO로 연동
> - taeannews.co.kr(엔디소프트 CMS)에서 RSS 또는 CMS Sync API로 신규/수정 기사를 5분 이내 가져옴
> - SSO(OAuth2)로 한 번 로그인 시 양쪽 도메인 사용 가능
> - 기사 페이지 하단에 insight 추천 카드 삽입 (CMS 템플릿 수정 1회)
> - 엔디소프트 협력 미흡 시 RSS·크롤링으로 백업 채널 확보

**Q3: 사용해야 할 특정 라이브러리·프레임워크는?**
> A: 권장 스택:
> - **백엔드**: FastAPI (Python) — LangGraph·LLM 통합 용이, 또는 NestJS (TypeScript) — 프론트와 언어 통일
> - **AI 오케스트레이션**: LangGraph (Lite 구성)
> - **추론 서버**: vLLM (한국어 모델 호환성 우수) 또는 TGI
> - **임베딩**: BGE-M3-Korean 또는 KURE-v1
> - **Vector DB**: PGVector (Postgres 확장, 운영 부담 최소)
> - **Knowledge Graph**: NetworkX (소규모) 또는 Neo4j Community
> - **캐시·Queue**: Redis
> - **프론트**: Next.js 14 (App Router) + Tailwind + shadcn/ui
> - **차트**: Recharts (간단) 또는 Apache ECharts (B2B 대시보드)
> - **에디터**: TipTap (시민기자)
> - **결제**: 토스페이먼츠 SDK (개발자 친화) 또는 KG이니시스

**Q4: 에러 핸들링 전략은?**
> A: 계층화된 에러 핸들링:
> - **클라이언트 에러** (401/403/422): 한국어 메시지 + 다음 단계 안내
> - **LLM 추론 실패**: 캐시 응답 폴백 → "지금 일시적으로 응답이 어렵습니다. 캐시된 최근 응답입니다" 안내
> - **외부 API 실패** (TourAPI 등): 마지막 성공 시점의 캐시된 데이터 사용 + 상단 배너로 알림
> - **결제 실패**: PG 측 에러 코드 매핑, 사용자에겐 일관된 메시지
> - **비용 임계 초과**: 자동 서킷 브레이커, 무료 호출 즉시 차단, 유료 사용자만 우선 응답
> - 모든 에러는 Sentry로 보고, 구조화 로그 JSON 형식 통일

**Q5: 데이터베이스 마이그레이션은?**
> A: 신규 구축이라 마이그레이션 부담 적음. 단,
> - 20년치 자체 기사 수집·OCR이 가장 큰 데이터 작업 (Phase 2A 16h+)
> - PGVector 인덱스는 `CREATE INDEX CONCURRENTLY` 사용, 운영 중 무중단
> - 일일 증분 임베딩 잡은 새벽 02:00 수행
> - 모든 마이그레이션은 Alembic 또는 Flyway로 버전 관리

**Q6: 비용 계측은 어떻게 정확히 하나요?**
> A: 다층 계측:
> - **LLM 추론**: 토큰 단위 — 입력/출력 토큰 수 × 모델별 단가 (Self-host는 GPU 시간 환산)
> - **GPU 시간**: 클라우드 청구서 or 자체 PC는 전력 사용량(약 350W × 시간 × kWh 단가)
> - **외부 API**: 호출당 단가 (Twilio·카카오 알림톡 등)
> - **스토리지**: GB·월 단가
> - **PG 수수료**: 트랜잭션 % (매출에서 차감 항목)
> - 모든 이벤트는 `cost_events` 테이블에 적재, 일·주·월 집계
> - 자동 알림: 월 누적 비용 70/90/100% 도달 시 슬랙·이메일

**Q7: HITL 워크플로는 코드로 어떻게 강제하나요?**
> A:
> - 발행 엔드포인트(`POST /articles/:id/publish`)에 가드 미들웨어 — `hitl_reviewer_id IS NULL`이면 403
> - AI 보조 사용 이력은 `ai_assist_log JSONB`로 영구 기록 (감사 추적)
> - 민감 주제 분류기가 'sensitive' 판정 → `requires_hitl=true` + 편집장 권한만 발행 가능
> - 시민기자 발행물은 무조건 에디터 1명 이상 검토 필요

---

### 디자이너 관점 (Designer's Perspective)

**Q8: 이 플랫폼의 핵심 UX 목표는?**
> A:
> - **3클릭 이내 핵심 가치 도달** — 첫 방문에서 주간 리포트 미리보기를 보기까지 3클릭
> - **고령자도 막힘 없이** — 39.7% 고령 인구 비중, 글자 크기·고대비 옵션이 기본
> - **신뢰감 강조** — 모든 AI 결과에 [AI 보조] 라벨·출처 명시, 사용자 안심
> - **B2B는 한 눈 대시보드** — 펜션 사장이 아침 5분 만에 의사결정

**Q9: 디자인 가이드라인은?**
> A:
> - **컬러**: 신뢰감 있는 네이비/오프화이트 (사업계획서 표지 톤 계승)
> - **타이포그래피**: Pretendard (한글), Inter (영문) — 가독성 우선
> - **간격**: 모바일 우선 8pt 그리드
> - **AI 라벨**: 본문 상단 황토색(#B8860B) 배지 [AI 보조] — 차별화된 시각 신호
> - **출처 인용**: 본문 하단 회색 박스, 클릭 시 원본 페이지 이동
> - **차트**: 일관된 팔레트, 색맹 친화(Color Universal Design)

**Q10: 접근성 요구사항은?**
> A: WCAG 2.1 AA + (주)엔씨투 자체 강화 기준:
> - 모든 이미지·차트 alt 텍스트
> - 키보드만으로 전 기능 가능 (Tab 순서 검증)
> - 색상 대비 ≥ 4.5:1, AI 라벨 배지는 7:1
> - 스크린 리더(NVDA·VoiceOver) 테스트
> - 글자 크기 3단계 (기본/크게/매우 크게), 고대비 모드 토글
> - TTS 옵션(주간 리포트 음성 청취) — (주)엔씨투 자체 TTS R&D 활용

**Q11: 반응형 브레이크포인트는?**
> A:
> - Mobile: 320~767px (단일 컬럼, 핵심 카드 위주)
> - Tablet: 768~1023px (2컬럼)
> - Desktop: 1024px+ (사이드바 + 메인)
> - B2B 대시보드는 1280px+에 최적화, 모바일에서는 핵심 카드만 노출 + 데스크톱 권장 안내

**Q12: 주요 사용자 플로우는?**
> A:
> - **B2C 신규**: 검색·SNS → taeannews 기사 → 하단 insight 카드 → SSO 로그인 → 무료 미리보기 → 7일 체험 → 결제
> - **B2B 신규**: 영업 컨택 → 데모 → 14일 체험 → 계약 → 정기 대시보드 활용
> - **시민기자**: 모집 신청 → 선발 → 6회 교육 → 작성(AI Co-Pilot) → 에디터 검토 → 발행 → 원고료
> - **운영자**: 슬랙 알림 → 비용 대시보드 → 임계 도달 시 자동 차단 확인

---

### QA 관점 (QA's Perspective)

**Q13: 핵심 테스트 시나리오와 우선순위는?**
> A:
> **P0 (블로킹):**
> - 자연어 질의 → 캐시 히트 → 1초 이내 응답
> - 자연어 질의 → 캐시 미스 → LLM 호출 → 8초 이내 응답 + [AI 보조] 라벨
> - 주간 리포트 배치 잡 성공률 (4주 연속)
> - 결제·구독 활성화 → 권한 즉시 부여
> - HITL 검토 없이 발행 시도 → 거부
>
> **P1 (중요):**
> - PII 입력 자동 마스킹
> - 민감 주제 차단
> - 비용 임계 알림 + 서킷 브레이커
> - 시민기자 발행 권한 흐름
>
> **P2 (일반):**
> - 접근성 자동 검사 (axe-core)
> - 반응형 화면 깨짐
> - 다중 브라우저 (Chrome/Safari/Firefox)

**Q14: 자동화 테스트 범위는?**
> A:
> - **단위**: Router 분류, 캐시 키, PII 마스킹, AI 라벨, 비용 계산 — 100%
> - **통합**: 모든 API 엔드포인트 — 100%
> - **E2E (Playwright)**: 핵심 4개 플로우 (구독·질의·시민기자·B2B 대시보드)
> - **AI 품질**: 평가셋 500문항 자동 회귀 (CI에서 매 PR마다 실행)
> - **시각 회귀**: 주요 화면 8개 스냅샷

**Q15: 성능 테스트 기준은?**
> A:
> - 캐시 히트: p95 < 1초
> - 캐시 미스: p95 < 8초
> - 페이지 로드: p95 < 3초 (모바일 4G)
> - 동시 200 req/sec 30분 부하 안정
> - 추론 서버 단독: 동시 10 req 처리 시 평균 < 6초

**Q16: 엣지 케이스는?**
> A:
> - 사용자가 한국어·영어 혼용 질의
> - 매우 긴 질의(>2,000 토큰)
> - SQL Injection·프롬프트 Injection 시도
> - 동시에 같은 사용자가 여러 기기로 결제 시도
> - 캐시 미스 직후 LLM 다운 (Redis도 다운 시)
> - 시민기자가 AI 보조 없이 발행 (정상 시나리오)
> - 결제 성공 후 PG 콜백 지연(웹훅 재시도)
> - 외부 API(공공 데이터) 응답 형식 변경

---

### PM·운영자 관점

**Q17: 핵심 고객 가치와 경쟁 차별점은?**
> A:
> - **고객 가치**: "월 1만원에 태안의 다음 주를 미리 안다" (B2C), "월 5만원에 펜션 의사결정 데이터 확보" (B2B), "AI와 함께 쓰는 시민 저널리즘" (시민기자)
> - **차별점**: 30만원 운영비라는 정량 약속, 20년치 자체 아카이브 기반 지역 깊이, 시민 참여 + HITL 품질 보증, 접근성 강점

**Q18: 출시 전략·타임라인은?**
> A:
> - 10월: 외부 베타 100명 (인플루언서·동호회 우선)
> - 11월: 시민기자 파일럿 + 사전 B2B 영업
> - 12월 15일: 정식 런칭 + 마케팅 캠페인
> - 12월 말: 1차 KPI 측정 + 결과 보고

**Q19: 성공 지표·추적 방법은?**
> A: KPI 4종 (사업계획서 동일):
> - 월 AI 운영비 ≤ 30만원 (대시보드 자동)
> - MRR 1,500만원 (PG 합산)
> - 유료 고객 120개 (DB)
> - MAU 12,000명 (GA4)
> 추가 보조 지표: AI 콘텐츠 42%, Churn ≤13%, 캐시 히트 ≥75%

**Q20: 사용자 피드백 수집은?**
> A:
> - 인앱 NPS 설문 (월 1회)
> - 베타 사용자 1:1 인터뷰 (10명)
> - 시민기자 월간 회고
> - B2B 분기 비즈니스 리뷰
> - 모든 결과는 Notion 또는 Airtable에 기록, 백로그로 환원

---

## 16. 사용자 관점 Q&A (User's Perspective Q&A)

### 가치 & 혜택

**Q1: insight.taeannews는 기존 태안신문과 뭐가 다른가요?**
> A: 기존 `taeannews.co.kr`은 무료 뉴스·커뮤니티 허브로 그대로 유지됩니다. `insight.taeannews.co.kr`은 새롭게 추가되는 **AI 예측·유료 인사이트 서비스**예요:
> - 다음 주 관광객·기상·환경을 미리 알려주는 주간 리포트
> - "다음 주말 안면도 미세먼지 어때?" 같은 자연어 질문 응답
> - 펜션·식당 등 사장님을 위한 데이터 대시보드
> - 시민기자가 AI 도구로 함께 쓰는 지역 기사

**Q2: 저에게 어떤 도움이 되나요?**
> A: 사용자 유형별로:
> - **태안 방문 계획 중인 관광객**: 다음 주말이 혼잡할지, 해넘이 시간·날씨가 어떨지 한 페이지로 확인
> - **이주·귀촌 검토 중**: 토지 시세 흐름, 정주 여건을 데이터로 비교
> - **태안 거주민**: 동네 환경·생활 정보, AI가 정리한 빠른 요약
> - **사장님 (B2B)**: 다음 주 관광객·기상 예측으로 운영 의사결정
> - **시민기자가 되고 싶은 분**: AI Co-Pilot으로 본업과 병행하며 글쓰기

### 사용 방법

**Q3: 어떻게 시작하나요?**
> A:
> 1. `insight.taeannews.co.kr` 접속
> 2. taeannews.co.kr 계정으로 한 번에 로그인 (별도 가입 불필요)
> 3. 무료 미리보기로 가치 체험
> 4. 마음에 들면 7일 무료 체험 → 결제

**Q4: 무료로도 쓸 수 있나요?**
> A: 네, 일부 기능은 무료로 사용 가능합니다:
> - 주간 리포트 미리보기 (30%)
> - AI 자연어 질문 하루 5회
> - 무료 시민기자 기사 열람
>
> 유료 구독(B2C Basic·Premium)을 하시면:
> - 전체 리포트 + PDF 다운로드
> - 자연어 질문 무제한
> - 광고 없는 깔끔한 화면
> - 모바일 푸시 알림

**Q5: 가격은 얼마인가요?**
> A: 가격은 베타 기간 동안 사용자 피드백을 받아 확정합니다(2026-10 발표 예정). 대략적인 범위:
> - B2C Basic: 월 약 5,000~10,000원
> - B2C Premium: 월 약 15,000~20,000원
> - B2B 기본 대시보드: 월 약 30,000~50,000원
> - B2B 프리미엄: 월 약 100,000원+
>
> 정확한 가격은 런칭 시 공지합니다.

**Q6: AI가 쓴 기사는 믿을 수 있나요?**
> A: 네, 다음과 같은 장치로 신뢰를 보장합니다:
> - 모든 AI 보조 콘텐츠에 **[AI 보조] 라벨** 명확히 표시
> - 모든 수치·인용에 **출처 명시** (원본 기사·공공 데이터 링크)
> - **사람 편집자(HITL)가 100% 검토**한 뒤에만 발행
> - 선거·범죄·의료 등 민감 주제는 **AI 단독 발행 금지**

### 시민기자 참여

**Q7: 시민기자가 되려면 어떻게 하나요?**
> A: 모집 일정·자격:
> - 2026년 7월 중순 모집 공고 (`taeannews.co.kr`에서 안내)
> - 12명 선발 (읍·면별 균형, 20~60대 다양한 연령)
> - 6회 교육 프로그램 (AI Co-Pilot 활용법·취재 윤리·편집장 멘토링)
> - 월 4~6편 작성, 편당 원고료 5~10만원
> - 우수 기자는 연말 30만원 인센티브

**Q8: 글쓰기에 자신이 없어도 가능한가요?**
> A: 네, AI Co-Pilot이 도와드립니다:
> - 사실 확인 자동 검색
> - 문단 요약·문장 다듬기
> - 제목 후보 5종 제안
> - 인용 출처 자동 검색
>
> 6회 교육 프로그램으로 처음 쓰는 분도 안내해드립니다.

### 개인정보 & 보안

**Q9: 제 정보는 안전하게 보관되나요?**
> A:
> - 개인정보보호법·KISA 처리방침 준수
> - 모든 통신은 HTTPS 암호화
> - 결제 정보는 PG사가 보관(우리는 저장하지 않음)
> - 이름·전화번호·이메일은 AES-256으로 암호화 저장
> - AI 학습 데이터에는 개인정보 절대 포함하지 않음
> - 언제든 회원 탈퇴 시 데이터 영구 삭제

**Q10: AI가 제 질문 내용을 다른 곳에 보내나요?**
> A: 아닙니다:
> - 모든 AI 추론은 **자체 서버**에서 처리 (외부 상용 LLM 의존 최소화)
> - 질의 내용은 캐시·로그 외에 외부 전송 없음
> - PII(이름·전화·이메일)는 자동 마스킹 후 처리
> - 분석 목적의 익명 통계만 사용

### 접근성

**Q11: 고령자나 시각장애인도 사용할 수 있나요?**
> A: 네, 접근성은 본 서비스의 핵심 가치입니다:
> - 글자 크기 3단계 (기본/크게/매우 크게)
> - 고대비 모드 토글
> - 스크린 리더(NVDA·VoiceOver) 완벽 지원
> - 키보드만으로 전 기능 사용 가능
> - 주간 리포트 음성 청취(TTS) 옵션
> - WCAG 2.1 AA 수준 + (주)엔씨투의 20년 접근성 전문성 적용

### 향후 계획

**Q12: 앞으로 어떤 기능이 추가되나요?**
> A: 단계별 로드맵:
> - **2027**: 캐싱 고도화로 응답 더 빠르게, 사용자 피드백 반영 개인화
> - **2028**: 태안 도메인 특화 AI 모델 파인튜닝, MRR 3,000만원 도전
> - **2030**: 인근 서산·당진·홍성과 함께하는 **충남 서해안 AI Hub**

**Q13: 모바일 앱은 언제 나오나요?**
> A: 현재는 모바일에 최적화된 웹(반응형)으로 사용 가능합니다. 별도 앱은 2027년 이후 검토 예정이며, 그 전에 PWA(설치 가능한 웹 앱) 옵션을 먼저 제공할 계획입니다.

**Q14: 구독은 언제든 해지할 수 있나요?**
> A: 네, 마이페이지에서 1클릭 해지 가능합니다. 다음 결제일 전에 해지하면 추가 청구 없으며, 남은 기간은 계속 이용 가능합니다.

---

## 17. 부록: 태스크 분해 힌트 (Appendix: Task Breakdown Hints)

### 17.1 권장 TaskMaster 태스크 구조

**Phase 1 — 설계 및 검증 (9 태스크, ~60시간)**
1. GPU 인프라 후보 비교 (4h)
2. LLM 모델 벤치마크 (Solar/Llama 후보 3종) (8h)
3. 양자화 변환 및 검증 (6h)
4. 한국어 평가셋 500문항 구축 (8h)
5. 캐싱 키 정규화 PoC (3h)
6. 월 30만원 비용 시뮬레이션 (5h)
7. 시민기자 모집·선발 운영 (12h, 사업 운영)
8. insight 도메인 등록 + DNS + HTTPS (2h)
9. 기술 요구사항서(SRS) 작성 및 승인 (12h)

**Phase 2A — 데이터 파이프라인 (4 태스크, ~44시간)**
10. 20년치 자체 기사 크롤링·OCR·정제 (16h)
11. 공공 API 수집 파이프라인(TourAPI·기상·해수부·KOSIS) (10h)
12. 임베딩 + PGVector 인덱싱 (8h)
13. Lite KG 엔티티 추출 및 적재 (10h)

**Phase 2B — AI Core Engine (6 태스크, ~43시간)**
14. vLLM/TGI 추론 서버 도커화 (6h)
15. LangGraph Lite Router 구현 (8h)
16. Prediction Agent / Generation Agent 구현 (14h)
17. Redis 캐시 레이어 (6h)
18. 사전 생성 배치 잡 (Top-N) (5h)
19. 비용 모니터링 + 서킷 브레이커 (8h, 추가 분할 가능)

**Phase 2C — 플랫폼 & 상품 (8 태스크, ~82시간)**
20. Next.js 부트스트랩 + 디자인 시스템 (8h)
21. 인증·SSO·결제 통합 (12h)
22. 주간 리포트 발행 시스템 (10h)
23. AI Query Agent UI (8h)
24. B2B 기본 대시보드 (10h)
25. 시민기자 Co-Pilot 에디터 (TipTap) (16h)
26. HITL 검토 워크플로 (8h)
27. AI 윤리·거버넌스 가드 (라벨·PII·민감주제) (10h)

**Phase 2D — 시민기자 교육 (2 태스크, ~17시간, 사업 운영)**
28. 6회 교육 프로그램 커리큘럼·교재 (12h)
29. 교육 LMS 모듈 (5h)

**Phase 3 — 베타 & 영업 (6 태스크, ~67시간)**
30. 내부 알파 테스트 (5h)
31. 외부 베타 운영 (100명) (8h)
32. 시민기자 파일럿 발행 (10h)
33. 사전 B2B 영업 (30 컨택, LOI 10+) (20h)
34. 피드백 반영 및 버그 수정 (16h)
35. 성능·보안 회귀 점검 (8h)

**Phase 4 — 런칭 (5 태스크, ~32시간)**
36. 런칭 마케팅 캠페인 (10h)
37. 1차 KPI 측정 + 보고 (4h)
38. 시민기자 연간 성과 평가 + 인센티브 지급 (4h)
39. 지역신문발전위원회 결과 보고서 작성 (10h)
40. 2027 로드맵 수립 (4h)

**총: 40 태스크 / 약 345시간 (개발) + 사업 운영 시간 별도**

> 예산 50,000,000원 / 7개월 = 월 7,142,857원 인건비 (Senior 개발자 1명 + 보조 인력 + PM + 시민기자 운영).
> 사업비 배분(v1.9: 38% AI Core / 28% 플랫폼·Hybrid / 11% 시민기자 / 6% 데이터·인프라 / 11% 마케팅·B2B 영업 / 6% PM·Contingency)이 본 태스크 구성과 정합한다.

### 17.2 병렬 가능 태스크

**동시 진행 가능:**
- Phase 2A (데이터)와 Phase 2B (AI Core)는 일정 부분 병렬 (#14~16은 #10~12 결과 필요하지만 추론 서버 준비는 병렬)
- Phase 2C 프론트엔드 작업들(#22, #23, #24, #25)은 백엔드 API 스펙 확정 후 병렬
- Phase 2D 시민기자 교육(#28, #29)은 Phase 2 전 기간 병렬

**순차 필요:**
- #14 (vLLM) → #15 (Router) → #16 (Agents) → #22~25 (상품 UI)
- 모든 상품 → #27 (윤리 가드) → #30 (알파)
- #30 → #31 → #34 → #36 (런칭)

### 17.3 임계 경로

```
#2 (모델 벤치마크) → #3 (양자화) → #14 (추론 서버)
  → #15 (Router) → #16 (Agents) → #17 (캐시) → #18 (사전 생성 배치)
  → #22 (주간 리포트) → #23 (Query UI) → #25 (시민기자 에디터)
  → #27 (윤리 가드) → #31 (외부 베타) → #34 (피드백 반영)
  → #36 (런칭 마케팅) → #37 (KPI 측정)
```

**임계 경로 소요 시간: ~180h** — Senior 개발자 1명 풀타임 약 6주, 사업 7개월 안에 충분히 수용 가능 (병렬 작업과 PM 일정 버퍼 포함).

### 17.4 위험·우선순위 매트릭스 (TaskMaster 분해 시 참고)

| 태스크 | 복잡도 | 위험도 | 의존성 | TaskMaster 우선순위 |
|-------|------|------|------|-----|
| #2 모델 벤치마크 | High | Critical | 없음 | **최우선** |
| #3 양자화 | Medium | High | #2 | 1순위 |
| #6 비용 시뮬레이션 | Medium | Critical | #2~3 | 1순위 |
| #10 자체 기사 크롤링 | High | Medium | 없음 (병렬) | 2순위 |
| #15~16 Router/Agents | High | High | #14 | 2순위 |
| #17 캐시 레이어 | Medium | High | #15 | 2순위 |
| #19 비용 모니터링 | Medium | Critical | 전 호출 경로 | 3순위 |
| #21 결제·SSO | High | Medium | #20 | 3순위 |
| #27 윤리 가드 | Medium | Critical | 전 상품 | 3순위 |
| #34 피드백 반영 | High | Medium | #31 | 4순위 (Phase 3) |

---

**PRD 종료**

*이 PRD는 태안신문 2026년 지역신문발전위원회 사업계획서 PDF를 기반으로 작성되었으며, TaskMaster AI 태스크 생성에 최적화되어 있습니다. 모든 요구사항에는 태스크 분해 힌트, 복잡도 추정, 의존성 매핑이 포함되어 효과적인 자동화된 태스크 계획을 가능케 합니다. 실무자 관점 Q&A와 사용자 관점 Q&A는 구현 중 예상되는 질문에 대한 사전 답변을 제공합니다.*

*다음 단계 권장:*
1. *본 PRD 검토 후 §12 미해결 질문(LLM 선정·GPU·PG·가격) 우선 결정*
2. *TaskMaster로 본 PRD를 태스크 트리로 분해*
3. *Phase 1 착수 (2026-05-18)*
