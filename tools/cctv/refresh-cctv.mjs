// 도로 CCTV 로컬 크롤러 — ITS cctvInfo(9443 포트, Worker가 직접 못 닿음)를 한국IP에서 받아
// Worker /api/conditions/cctv/ingest 로 적재. 스트림 토큰 ~120분 유효 → launchd로 30분마다 갱신.
//   필요 env: ITS_API_KEY, TAEAN_GOV_TOKEN(= Worker GOV_IMPORT_TOKEN)
//   사용: ITS_API_KEY=.. TAEAN_GOV_TOKEN=.. node tools/cctv/refresh-cctv.mjs [--api=https://...]

const API = process.argv.find((a) => a.startsWith("--api="))?.slice(6)
  || process.env.TAEAN_API || "https://taean-insight-api.chs9182.workers.dev";
const KEY = process.env.ITS_API_KEY;
const TOKEN = process.env.TAEAN_GOV_TOKEN;
if (!KEY) { console.error("ITS_API_KEY 필요"); process.exit(1); }
if (!TOKEN) { console.error("TAEAN_GOV_TOKEN 필요 (Worker GOV_IMPORT_TOKEN과 동일)"); process.exit(1); }

const BASE = "https://openapi.its.go.kr:9443/cctvInfo";
// 태안 박스(약간 여유) — 도로명 '태안' 포함만 추림
const BOX = { minX: 126.05, maxX: 126.5, minY: 36.55, maxY: 37.1 };

async function fetchType(type) {
  const sp = new URLSearchParams({ apiKey: KEY, type, cctvType: "1", getType: "json",
    minX: String(BOX.minX), maxX: String(BOX.maxX), minY: String(BOX.minY), maxY: String(BOX.maxY) });
  const res = await fetch(`${BASE}?${sp}`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`ITS ${type} HTTP ${res.status}`);
  const j = await res.json();
  return (j?.response?.data ?? []).map((d) => ({
    id: String(d.roadsectionid || d.cctvname),
    name: String(d.cctvname || "도로 CCTV"),
    road: type === "ex" ? "고속도로" : "국도",
    lat: Number(d.coordy), lon: Number(d.coordx),
    url: String(d.cctvurl || "").replace(/^http:/, "https:"), // 혼합콘텐츠 방지
  }));
}

async function main() {
  const [its, ex] = await Promise.all([fetchType("its"), fetchType("ex")]);
  const cameras = [...its, ...ex].filter((c) => c.url && Number.isFinite(c.lat) && Number.isFinite(c.lon) && c.name.includes("태안"));
  console.log(`${new Date().toISOString()} 태안 카메라 ${cameras.length}대 수집`);
  const res = await fetch(`${API}/api/conditions/cctv/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ cameras }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) { console.error("적재 실패", res.status, out); process.exit(1); }
  console.log(`적재 완료: ${out.count}대`);
}

main().catch((e) => { console.error("오류:", e.message); process.exit(1); });
