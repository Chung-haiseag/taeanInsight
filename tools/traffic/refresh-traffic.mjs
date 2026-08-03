// 충남 고속도로 교통량 로컬 크롤러 — data.ex.co.kr(Worker가 직접 못 닿음, 타임아웃)에서
//   대전충남본부(903) 권역 교통량을 한국IP에서 받아 Worker /api/conditions/traffic/ingest 로 적재.
//   출구=고속도로 진출=충남 도착 유입 ≈ 관광 선행신호. ITS CCTV 크롤러와 동일 패턴(launchd 주기 실행).
//   필요 env: EX_API_KEY(도로공사 공개키), TAEAN_GOV_TOKEN(= Worker GOV_IMPORT_TOKEN)
//   사용: EX_API_KEY=.. TAEAN_GOV_TOKEN=.. node tools/traffic/refresh-traffic.mjs [--api=https://...]

const API = process.argv.find((a) => a.startsWith("--api="))?.slice(6)
  || process.env.TAEAN_API || "https://taean-insight-api.chs9182.workers.dev";
const KEY = process.env.EX_API_KEY;
const TOKEN = process.env.TAEAN_GOV_TOKEN;
if (!KEY) { console.error("EX_API_KEY 필요"); process.exit(1); }
if (!TOKEN) { console.error("TAEAN_GOV_TOKEN 필요 (Worker GOV_IMPORT_TOKEN과 동일)"); process.exit(1); }

const REGION = "903"; // 대전충남본부
const BASE = "https://data.ex.co.kr/openapi/trafficapi/trafficRegion";

async function fetchRows() {
  const rows = [];
  for (let p = 1; p <= 4; p++) {
    const qs = new URLSearchParams({ key: KEY, type: "json", numOfRows: "500", pageNo: String(p) });
    const res = await fetch(`${BASE}?${qs}`, { signal: AbortSignal.timeout(15000) });
    const j = await res.json();
    const l = j.trafficRegion || [];
    rows.push(...l);
    if (l.length < 500) break;
  }
  return rows;
}

function aggregate(rows) {
  const sel = rows.filter((r) => r.regionCode === REGION);
  if (!sel.length) return null;
  let inbound = 0, outbound = 0;
  for (const r of sel) {
    const n = Number(r.trafficAmout);
    const v = Number.isFinite(n) ? n : 0;
    if (r.inoutName === "출구") outbound += v;
    else if (r.inoutName === "입구") inbound += v;
  }
  return { region: sel[0].regionName || REGION, inbound, outbound, sumDate: sel[0].sumDate || null, sumTm: sel[0].sumTm || null };
}

async function main() {
  const t = aggregate(await fetchRows());
  if (!t || !t.sumDate) { console.error("교통량 데이터 없음(903 미포함)"); process.exit(1); }
  const res = await fetch(`${API}/api/conditions/traffic/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(t),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) { console.error("적재 실패", res.status, out); process.exit(1); }
  console.log(`${new Date().toISOString()} 적재: 충남 출구 ${t.outbound}·입구 ${t.inbound} (${t.sumDate} ${t.sumTm}시)`);
}

main().catch((e) => { console.error("오류:", e.message); process.exit(1); });
