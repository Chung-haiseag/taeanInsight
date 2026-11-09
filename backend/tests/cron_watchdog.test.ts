import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// 파수꾼은 무거운 작업 **뒤에** 서면 안 된다.
//
//   2026-11-09 실측: 기사 듣기 건강 판정(kv_cache audio_health)과 지식그래프 논리 감사
//   (kg_logic_audit)가 둘 다 2026-11-04 00:01 KST 에서 멈춰 있었다. 같은 순간이다.
//   두 블록은 자정 크론 꼬리의 마지막 둘이고, 바로 앞(예보 적중률)은 오늘도 돌았다
//   (forecast_log 최신 대상일 2026-11-18). try/catch 가 있는데도 둘 다 아무것도 안 썼다 —
//   예외가 아니라 **실행이 그 자리에서 끊긴 것**이다(CPU·시간 한도). 한 번의 호출 안에서
//   앞사람이 예산을 다 쓰면 뒷사람은 코드가 멀쩡해도 영영 돌지 않는다.
//
//   그래서 둘에게 **각자의 크론 호출**을 준다. 이 시험은 그 배치를 지킨다.
//   ⚠ 특히 기사 듣기 알림은 '조용히 죽지 않게' 하려고 만든 것이다. 그것이 조용히 죽는
//     자리에 있었다. 꼬리로 되돌리는 변경은 여기서 막힌다.

const src = readFileSync(join(process.cwd(), "src/index.ts"), "utf8");
const cfg = readFileSync(join(process.cwd(), "wrangler.jsonc"), "utf8");

const AUDIO_CRON = "0 4 * * *";
const AUDIT_CRON = "0 5 * * *";

/** 그 크론 가지가 시작하는 위치. 없으면 -1. */
const branchAt = (cron: string) => src.indexOf(`_event.cron === "${cron}"`);
/** 꼬리(어느 가지에도 안 걸린 크론이 흘러드는 곳)의 표지. */
const tailAt = () => src.indexOf("recordForecasts");

/** 가지 시작부터 중괄호가 닫히는 데까지의 본문. */
function branchBody(cron: string): string {
  const start = branchAt(cron);
  expect(start, `${cron} 가지가 없다`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = src.indexOf("{", start); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i);
  }
  throw new Error(`${cron} 가지가 닫히지 않는다`);
}

describe("크론 파수꾼 배치", () => {
  it("두 파수꾼 일정이 wrangler 에 선언돼 있다", () => {
    expect(cfg).toContain(`"${AUDIO_CRON}"`);
    expect(cfg).toContain(`"${AUDIT_CRON}"`);
  });

  it("기사 듣기 건강·알림은 제 가지 안에 있고 꼬리보다 앞선다", () => {
    const body = branchBody(AUDIO_CRON);
    expect(body).toContain("checkAudioHealth");
    expect(body).toContain("notifyAdmins");
    expect(branchAt(AUDIO_CRON)).toBeLessThan(tailAt());
  });

  it("지식그래프 논리 감사도 제 가지 안에 있다", () => {
    expect(branchBody(AUDIT_CRON)).toContain("runLogicAudit");
    expect(branchAt(AUDIT_CRON)).toBeLessThan(tailAt());
  });

  it("두 가지는 return 으로 끝나 꼬리를 타지 않는다", () => {
    for (const cron of [AUDIO_CRON, AUDIT_CRON]) expect(branchBody(cron)).toContain("return");
  });

  it("파수꾼 호출에는 무거운 작업을 같이 태우지 않는다", () => {
    for (const cron of [AUDIO_CRON, AUDIT_CRON]) {
      const body = branchBody(cron);
      for (const heavy of ["ingestToArchive", "snapshotEnv", "recordForecasts", "ingestRegionalNews"]) {
        expect(body, `${cron} 가지에 ${heavy} 가 끼어 있다`).not.toContain(heavy);
      }
    }
  });

  it("옮긴 블록이 꼬리에 남아 두 번 돌지 않는다", () => {
    // 호출부가 아니라 **동적 import 경로**를 센다 — 호출부는 import 구문까지 두 번 잡힌다.
    for (const mod of ["./audio/health", "./kg/logic_audit"]) {
      expect(src.split(`import("${mod}")`).length - 1, `${mod} 를 여러 군데서 부른다`).toBe(1);
    }
  });
});
