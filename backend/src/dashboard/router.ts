// B2B 지역 데이터 분석 대시보드 API — 지역 시장 시계열(집계) + CSV 다운로드.
//   사장님 홈(개인 가게 행동)과 구분: 여기는 기관·업체·연구용 '지역 전체' 데이터.
//   GET /api/dashboard/series?days=30   환경·수요 시계열(D1)
//   GET /api/dashboard/export?dataset=environment|demand&days=90  CSV

import { Hono } from "hono";
import type { Env } from "../types";

export const dashboardRouter = new Hono<{ Bindings: Env }>();

const clampDays = (q: string | undefined) => Math.min(365, Math.max(7, Number(q || "30") || 30));

interface EnvRow { date: string; pm10: number | null; pm25: number | null; o3: number | null; temp: number | null; humidity: number | null }
interface DemandRow { date: string; idx: number | null; level: string | null }

async function envSeries(db: D1Database, days: number): Promise<EnvRow[]> {
  const r = await db.prepare(
    "SELECT date, pm10, pm25, o3, temp, humidity FROM env_daily ORDER BY date DESC LIMIT ?1",
  ).bind(days).all<EnvRow>();
  return (r.results ?? []).reverse(); // 오래된→최신
}
async function demandSeries(db: D1Database, days: number): Promise<DemandRow[]> {
  const r = await db.prepare(
    "SELECT weekend_sat AS date, idx, level FROM tour_demand_log ORDER BY captured_at DESC LIMIT ?1",
  ).bind(days).all<DemandRow>();
  return (r.results ?? []).reverse();
}

dashboardRouter.get("/series", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ environment: [], demand: [] });
  const days = clampDays(c.req.query("days"));
  const [environment, demand] = await Promise.all([envSeries(db, days), demandSeries(db, days)]);
  return c.json({ days, environment, demand });
});

function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const esc = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}

dashboardRouter.get("/export", async (c) => {
  const db = c.env.ARCHIVE_DB;
  if (!db) return c.json({ error: "no_db" }, 503);
  const days = clampDays(c.req.query("days"));
  const dataset = c.req.query("dataset") === "demand" ? "demand" : "environment";
  let csv: string;
  if (dataset === "demand") {
    const rows = await demandSeries(db, days);
    csv = toCsv(["weekend", "demand_index", "level"], rows.map((r) => [r.date, r.idx, r.level]));
  } else {
    const rows = await envSeries(db, days);
    csv = toCsv(["date", "pm10", "pm25", "o3", "temp", "humidity"], rows.map((r) => [r.date, r.pm10, r.pm25, r.o3, r.temp, r.humidity]));
  }
  return new Response("﻿" + csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="taean-${dataset}-${days}d.csv"`,
    },
  });
});
