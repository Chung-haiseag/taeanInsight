// 백필 체크포인트(월별 JSON)를 읽어 태안 방문자 실제 패턴 분석.
//   - 월(календарь)별 일평균 외부 방문객(외지인+외국인) → 현재 seasonBase 규칙과 대조
//   - 주말(토·일) vs 평일 배수
//   - 피크 주말 Top

import { readdirSync, readFileSync } from "node:fs";

const SCRATCH = "/private/tmp/claude-501/-Applications-taean/547b8445-13ab-4942-b547-45fd80f0f168/scratchpad";
const CKPT = `${SCRATCH}/backfill_ckpt`;

const rows = [];
for (const f of readdirSync(CKPT).filter((x) => x.endsWith(".json"))) {
  for (const r of JSON.parse(readFileSync(`${CKPT}/${f}`, "utf8"))) rows.push(r);
}
// ymd -> {outside, local, wk}
const byDay = new Map();
for (const r of rows) {
  const d = byDay.get(r.ymd) || { outside: 0, local: 0, wk: r.wk };
  if (r.cd === "1") d.local += r.num; else d.outside += r.num;
  byDay.set(r.ymd, d);
}
const days = [...byDay.entries()].map(([ymd, v]) => ({ ymd, ...v, mon: Number(ymd.slice(4, 6)), isWeekend: v.wk === "6" || v.wk === "7" }));

console.log(`총 ${days.length}일 (${days[0]?.ymd}~${days[days.length - 1]?.ymd})\n`);

// 월별 일평균 외부 방문객
const monAgg = {};
for (const d of days) { (monAgg[d.mon] ??= []).push(d.outside); }
console.log("월별 일평균 외부방문객(외지인+외국인):");
const monAvg = {};
for (let m = 1; m <= 12; m++) {
  const a = monAgg[m] || [];
  const avg = a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
  monAvg[m] = avg;
  console.log(`  ${String(m).padStart(2)}월  ${Math.round(avg).toLocaleString().padStart(9)}  (n=${a.length})`);
}
// 실측 기반 정규화 계절점(최대월=45로 스케일 → 현재 규칙과 같은 축)
const maxAvg = Math.max(...Object.values(monAvg));
console.log("\n실측 정규화 계절점(최댓월=45 기준) vs 현재 규칙:");
const RULE = { 1: 12, 2: 12, 3: 18, 4: 28, 5: 32, 6: 32, 7: 45, 8: 45, 9: 32, 10: 28, 11: 18, 12: 12 };
for (let m = 1; m <= 12; m++) {
  const scaled = Math.round((monAvg[m] / maxAvg) * 45);
  console.log(`  ${String(m).padStart(2)}월  실측 ${String(scaled).padStart(2)}  |  규칙 ${String(RULE[m]).padStart(2)}  ${scaled - RULE[m] > 6 ? "↑저평가" : RULE[m] - scaled > 6 ? "↓고평가" : ""}`);
}
// 주말 배수
const we = days.filter((d) => d.isWeekend).map((d) => d.outside);
const wd = days.filter((d) => !d.isWeekend).map((d) => d.outside);
const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
console.log(`\n주말 일평균 ${Math.round(mean(we)).toLocaleString()} vs 평일 ${Math.round(mean(wd)).toLocaleString()} → 배수 ${(mean(we) / mean(wd)).toFixed(2)}x`);

// 피크 주말(토) Top 8
const sats = days.filter((d) => d.wk === "6").sort((a, b) => b.outside - a.outside).slice(0, 8);
console.log("\n피크 토요일 Top8 (외부방문객):");
for (const s of sats) console.log(`  ${s.ymd}  ${Math.round(s.outside).toLocaleString()}`);
