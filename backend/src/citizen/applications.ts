// 시민기자 신청 대기열 — 순수 결정로직 + D1 리포지토리.
export type AppStatus = "pending" | "approved" | "rejected";

export interface CitizenApplication {
  id: number;
  user_id: number;
  status: AppStatus;
  reason: string | null;
  applied_at: string;
  decided_at: string | null;
  decided_by: number | null;
}

export function decisionToStatus(decision: "approve" | "reject"): AppStatus {
  return decision === "approve" ? "approved" : "rejected";
}

// 승인이고 현재 등급이 user일 때만 citizen 승격(상위 등급은 보존).
export function shouldPromoteToCitizen(decision: "approve" | "reject", currentRole: string): boolean {
  return decision === "approve" && currentRole === "user";
}

// 신청(재신청 시 pending으로 갱신). UNIQUE(user_id) 충돌 시 갱신.
export async function applyForCitizen(db: D1Database, userId: number, reason: string | null, nowIso: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO citizen_applications (user_id, status, reason, applied_at, decided_at, decided_by)
       VALUES (?1,'pending',?2,?3,NULL,NULL)
       ON CONFLICT(user_id) DO UPDATE SET status='pending', reason=excluded.reason, applied_at=excluded.applied_at, decided_at=NULL, decided_by=NULL`,
    )
    .bind(userId, reason, nowIso)
    .run();
}

export async function myApplication(db: D1Database, userId: number): Promise<CitizenApplication | null> {
  const row = await db
    .prepare("SELECT id, user_id, status, reason, applied_at, decided_at, decided_by FROM citizen_applications WHERE user_id=?")
    .bind(userId)
    .first<CitizenApplication>();
  return row ?? null;
}
