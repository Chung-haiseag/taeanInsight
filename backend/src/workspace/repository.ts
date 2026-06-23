// 팀·부서 공유 워크스페이스 D1 저장소 (migration 017).

export interface Workspace { id: string; name: string; kind: "team" | "dept"; joinCode: string; createdBy: string; createdAt: string }
export interface WorkspaceMember { userId: string; role: "admin" | "member"; displayName: string | null; joinedAt: string }
export interface WorkspaceNote { id: string; userId: string; authorName: string | null; body: string; createdAt: string }
export interface WorkspaceItem { id: string; userId: string; label: string; url: string | null; kind: string | null; createdAt: string }
export interface WorkspaceView { workspace: (Workspace & { role: "admin" | "member" }) | null; members: WorkspaceMember[]; items: WorkspaceItem[]; notes: WorkspaceNote[] }

const uid = () => crypto.randomUUID();
function code6(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 헷갈리는 0/O/1/I 제외
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => chars[b % chars.length]).join("");
}

export class WorkspaceRepo {
  constructor(private db: D1Database) {}

  async create(name: string, kind: "team" | "dept", userId: string, displayName?: string): Promise<Workspace> {
    const ws: Workspace = { id: uid(), name, kind, joinCode: code6(), createdBy: userId, createdAt: new Date().toISOString() };
    await this.db.prepare("INSERT INTO workspaces (id,name,kind,join_code,created_by,created_at) VALUES (?1,?2,?3,?4,?5,?6)")
      .bind(ws.id, ws.name, ws.kind, ws.joinCode, ws.createdBy, ws.createdAt).run();
    await this.addMember(ws.id, userId, "admin", displayName);
    return ws;
  }

  async addMember(workspaceId: string, userId: string, role: "admin" | "member", displayName?: string): Promise<void> {
    await this.db.prepare(
      `INSERT INTO workspace_members (workspace_id,user_id,role,display_name,joined_at) VALUES (?1,?2,?3,?4,?5)
       ON CONFLICT(workspace_id,user_id) DO UPDATE SET display_name=excluded.display_name`,
    ).bind(workspaceId, userId, role, displayName ?? null, new Date().toISOString()).run();
  }

  async findByCode(code: string): Promise<Workspace | null> {
    const r = await this.db.prepare("SELECT * FROM workspaces WHERE join_code=?1").bind(code.toUpperCase()).first<Record<string, string>>();
    return r ? this.row(r) : null;
  }

  // 사용자가 속한 첫 워크스페이스(가장 최근 가입). MVP는 1인 1워크스페이스 표시.
  async primaryForUser(userId: string): Promise<(Workspace & { role: "admin" | "member" }) | null> {
    const r = await this.db.prepare(
      `SELECT w.*, m.role AS my_role FROM workspace_members m JOIN workspaces w ON w.id=m.workspace_id
       WHERE m.user_id=?1 ORDER BY m.joined_at DESC LIMIT 1`,
    ).bind(userId).first<Record<string, string>>();
    return r ? { ...this.row(r), role: (r.my_role as "admin" | "member") } : null;
  }

  async view(userId: string): Promise<WorkspaceView> {
    const ws = await this.primaryForUser(userId);
    if (!ws) return { workspace: null, members: [], items: [], notes: [] };
    const [members, items, notes] = await Promise.all([
      this.db.prepare("SELECT user_id,role,display_name,joined_at FROM workspace_members WHERE workspace_id=?1 ORDER BY joined_at").bind(ws.id).all<Record<string, string>>(),
      this.db.prepare("SELECT * FROM workspace_items WHERE workspace_id=?1 ORDER BY created_at DESC LIMIT 50").bind(ws.id).all<Record<string, string>>(),
      this.db.prepare("SELECT * FROM workspace_notes WHERE workspace_id=?1 ORDER BY created_at DESC LIMIT 50").bind(ws.id).all<Record<string, string>>(),
    ]);
    return {
      workspace: ws,
      members: (members.results ?? []).map((m) => ({ userId: m.user_id, role: m.role as "admin" | "member", displayName: m.display_name ?? null, joinedAt: m.joined_at })),
      items: (items.results ?? []).map((i) => ({ id: i.id, userId: i.user_id, label: i.label, url: i.url ?? null, kind: i.kind ?? null, createdAt: i.created_at })),
      notes: (notes.results ?? []).map((n) => ({ id: n.id, userId: n.user_id, authorName: n.author_name ?? null, body: n.body, createdAt: n.created_at })),
    };
  }

  async memberOf(workspaceId: string, userId: string): Promise<boolean> {
    const r = await this.db.prepare("SELECT 1 AS x FROM workspace_members WHERE workspace_id=?1 AND user_id=?2").bind(workspaceId, userId).first();
    return !!r;
  }
  async memberCount(workspaceId: string): Promise<number> {
    const r = await this.db.prepare("SELECT COUNT(*) AS n FROM workspace_members WHERE workspace_id=?1").bind(workspaceId).first<{ n: number }>();
    return r?.n ?? 0;
  }

  async addNote(workspaceId: string, userId: string, authorName: string | undefined, body: string): Promise<void> {
    await this.db.prepare("INSERT INTO workspace_notes (id,workspace_id,user_id,author_name,body,created_at) VALUES (?1,?2,?3,?4,?5,?6)")
      .bind(uid(), workspaceId, userId, authorName ?? null, body, new Date().toISOString()).run();
  }
  async addItem(workspaceId: string, userId: string, label: string, url?: string, kind?: string): Promise<void> {
    await this.db.prepare("INSERT INTO workspace_items (id,workspace_id,user_id,label,url,kind,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)")
      .bind(uid(), workspaceId, userId, label, url ?? null, kind ?? null, new Date().toISOString()).run();
  }
  // 본인 작성분만 삭제(admin은 전체)
  async deleteNote(workspaceId: string, id: string, userId: string, isAdmin: boolean): Promise<void> {
    if (isAdmin) await this.db.prepare("DELETE FROM workspace_notes WHERE id=?1 AND workspace_id=?2").bind(id, workspaceId).run();
    else await this.db.prepare("DELETE FROM workspace_notes WHERE id=?1 AND workspace_id=?2 AND user_id=?3").bind(id, workspaceId, userId).run();
  }
  async deleteItem(workspaceId: string, id: string, userId: string, isAdmin: boolean): Promise<void> {
    if (isAdmin) await this.db.prepare("DELETE FROM workspace_items WHERE id=?1 AND workspace_id=?2").bind(id, workspaceId).run();
    else await this.db.prepare("DELETE FROM workspace_items WHERE id=?1 AND workspace_id=?2 AND user_id=?3").bind(id, workspaceId, userId).run();
  }
  async leave(workspaceId: string, userId: string): Promise<void> {
    await this.db.prepare("DELETE FROM workspace_members WHERE workspace_id=?1 AND user_id=?2").bind(workspaceId, userId).run();
  }

  private row(r: Record<string, string>): Workspace {
    return { id: r.id, name: r.name, kind: r.kind as "team" | "dept", joinCode: r.join_code, createdBy: r.created_by, createdAt: r.created_at };
  }
}
