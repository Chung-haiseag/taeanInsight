// KAMIS 어패류 소매 시세 로컬 크롤러 — Worker가 KAMIS(www.kamis.co.kr) 직접 못 닿아(HTTP 전용+HTTPS 인증서 오류)
//   한국IP에서 http+브라우저UA로 받아 Worker /api/conditions/seafood/ingest 로 적재. 교통량 크롤러와 동일 패턴.
//   필요 env: KAMIS_CERT_KEY(+KAMIS_CERT_ID, 없으면 키와 동일), TAEAN_GOV_TOKEN(= Worker GOV_IMPORT_TOKEN)
//   사용: KAMIS_CERT_KEY=.. TAEAN_GOV_TOKEN=.. node tools/seafood/refresh-seafood.mjs [--api=https://...]

const API = process.argv.find((a) => a.startsWith("--api="))?.slice(6)
  || process.env.TAEAN_API || "https://taean-insight-api.chs9182.workers.dev";
const CERT_KEY = process.env.KAMIS_CERT_KEY;
const CERT_ID = process.env.KAMIS_CERT_ID || CERT_KEY; // KAMIS 가입ID. 미설정 시 키로 대체(현재 통과 확인).
const TOKEN = process.env.TAEAN_GOV_TOKEN;
if (!CERT_KEY) { console.error("KAMIS_CERT_KEY 필요"); process.exit(1); }
if (!TOKEN) { console.error("TAEAN_GOV_TOKEN 필요 (Worker GOV_IMPORT_TOKEN과 동일)"); process.exit(1); }

const BASE = "http://www.kamis.co.kr/service/price/xml.do";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

// 태안 대표 어패류(백엔드 seafood.ts TAEAN_SEAFOOD와 동일 순서). 우럭=조피볼락은 KAMIS 소매 목록 없음.
const CURATED = [
  { code: "656", name: "꽃게", emoji: "🦀" },
  { code: "661", name: "바지락", emoji: "🐚" },
  { code: "653", name: "전복", emoji: "🦪" },
  { code: "664", name: "낙지", emoji: "🐙" },
  { code: "665", name: "꼬막", emoji: "🐚" },
  { code: "654", name: "새우", emoji: "🦐" },
  { code: "619", name: "물오징어", emoji: "🦑" },
  { code: "613", name: "갈치", emoji: "🐟" },
];

function parsePrice(s) {
  if (s == null) return null;
  const n = Number(String(s).replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}
function kindScore(it) {
  const k = it.kind_name || "";
  let s = 0;
  if (/국산|국내|연근해|신선|냉장/.test(k)) s += 2;
  if (/수입|원양/.test(k)) s -= 1;
  return s;
}
function pickSeafood(items) {
  const out = [];
  for (const c of CURATED) {
    const cands = items.filter((it) => it.item_code === c.code && parsePrice(it.dpr1) != null);
    if (!cands.length) continue;
    cands.sort((a, b) => kindScore(b) - kindScore(a));
    const it = cands[0];
    const price = parsePrice(it.dpr1);
    const prev = parsePrice(it.dpr3);
    out.push({
      code: c.code, name: c.name, emoji: c.emoji,
      kind: it.kind_name || "", unit: it.unit || "",
      price, prevPrice: prev,
      deltaPct: prev ? Math.round(((price - prev) / prev) * 1000) / 10 : null,
    });
  }
  return out;
}

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// KAMIS는 간헐적으로 HTML 차단페이지 반환 → 재시도. 부류 600(수산물)·소매(01).
async function fetchCategory(regday) {
  const qs = new URLSearchParams({
    action: "dailyPriceByCategoryList",
    p_product_cls_code: "01", p_item_category_code: "600", p_country_code: "",
    p_regday: regday, p_convert_kg_yn: "N",
    p_cert_key: CERT_KEY, p_cert_id: CERT_ID, p_returntype: "json",
  });
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(`${BASE}?${qs}`, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(15000) });
      const txt = await res.text();
      if (txt[0] !== "{") continue; // HTML 차단페이지 → 재시도
      const j = JSON.parse(txt);
      if (j?.data?.error_code && j.data.error_code !== "000") return [];
      return Array.isArray(j?.data?.item) ? j.data.item : [];
    } catch {
      // 네트워크 오류 → 다음 시도
    }
  }
  return [];
}

async function main() {
  // 오늘부터 최대 4일 전까지 데이터 있는 최신일 사용(KAMIS 소매가 갱신 지연 대비).
  let picked = [], usedDay = null;
  for (let back = 0; back <= 4; back++) {
    const d = new Date(); d.setDate(d.getDate() - back);
    const day = ymd(d);
    const items = await fetchCategory(day);
    const p = pickSeafood(items);
    if (p.length >= 3) { picked = p; usedDay = day; break; } // 최소 3품목 있으면 채택
  }
  if (!usedDay || !picked.length) { console.error(`${new Date().toISOString()} 어패류 데이터 없음(최근 5일)`); process.exit(1); }

  const res = await fetch(`${API}/api/conditions/seafood/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ date: usedDay, items: picked }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) { console.error("적재 실패", res.status, out); process.exit(1); }
  const summary = picked.map((p) => `${p.name} ${p.price.toLocaleString()}/${p.unit}`).join(" · ");
  console.log(`${new Date().toISOString()} 적재(${usedDay}) ${picked.length}품목: ${summary}`);
}

main().catch((e) => { console.error("오류:", e.message); process.exit(1); });
