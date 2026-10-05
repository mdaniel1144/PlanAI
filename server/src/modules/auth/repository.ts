import type { Db } from "../../infrastructure/database/database";
import type {
  ManagedUser,
  CreateUserRequest,
  UpdateUserRequest,
} from "@habitat/contracts";
import { randomUUID } from "node:crypto";
import { AuthError } from "./errors";
export type UserRecord = ManagedUser & { passwordHash: string };
const columns = `id, email, name, role, status, created_at AS createdAt, updated_at AS updatedAt, last_login_at AS lastLoginAt, length_display_unit AS lengthDisplayUnit`;
export class AuthRepository {
  constructor(readonly db: Db["sqlite"]) {}
  byId(id: string) {
    return this.db
      .prepare(
        `SELECT ${columns}, password_hash AS passwordHash FROM users WHERE id=?`,
      )
      .get(id) as UserRecord | undefined;
  }
  byEmail(email: string) {
    return this.db
      .prepare(
        `SELECT ${columns}, password_hash AS passwordHash FROM users WHERE email=? COLLATE NOCASE`,
      )
      .get(email) as UserRecord | undefined;
  }
  list() {
    return this.db
      .prepare(`SELECT ${columns} FROM users ORDER BY name COLLATE NOCASE, id`)
      .all() as ManagedUser[];
  }
  require(id: string) {
    const user = this.byId(id);
    if (!user) throw new AuthError(404, "USER_NOT_FOUND", "User not found.");
    return user;
  }
  activeAdmins() {
    return (
      this.db
        .prepare(
          "SELECT count(*) n FROM users WHERE role='ADMIN' AND status='ACTIVE'",
        )
        .get() as { n: number }
    ).n;
  }
  insert(input: CreateUserRequest, passwordHash: string) {
    if (this.byEmail(input.email))
      throw new AuthError(
        409,
        "USER_EMAIL_ALREADY_EXISTS",
        "A user with this email already exists.",
      );
    const id = randomUUID(),
      now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO users (id,email,name,password_hash,role,status,created_at,updated_at) VALUES (?,?,?,?,?,'ACTIVE',?,?)",
      )
      .run(id, input.email, input.name, passwordHash, input.role, now, now);
    return this.require(id);
  }
  update(id: string, input: UpdateUserRequest) {
    const previous = this.require(id),
      next = { ...previous, ...input };
    if (
      previous.role === "ADMIN" &&
      previous.status === "ACTIVE" &&
      (next.role !== "ADMIN" || next.status !== "ACTIVE") &&
      this.activeAdmins() <= 1
    )
      throw new AuthError(
        400,
        "USER_LAST_ADMIN_PROTECTED",
        "The final active administrator cannot be demoted or disabled.",
      );
    const duplicate = this.byEmail(next.email);
    if (duplicate && duplicate.id !== id)
      throw new AuthError(
        409,
        "USER_EMAIL_ALREADY_EXISTS",
        "A user with this email already exists.",
      );
    this.db
      .prepare(
        "UPDATE users SET name=?,email=?,role=?,status=?,updated_at=? WHERE id=?",
      )
      .run(
        next.name,
        next.email,
        next.role,
        next.status,
        new Date().toISOString(),
        id,
      );
    if (next.status === "DISABLED" || previous.email !== next.email)
      this.revokeUserSessions(id);
    return this.require(id);
  }
  revokeUserSessions(userId: string, exceptId: string | null = null) {
    this.db
      .prepare(
        "UPDATE user_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL AND (? IS NULL OR id<>?)",
      )
      .run(new Date().toISOString(), userId, exceptId, exceptId);
  }
  cleanupSessions() {
    return this.db
      .prepare(
        "DELETE FROM user_sessions WHERE expires_at<=? OR revoked_at IS NOT NULL",
      )
      .run(new Date().toISOString()).changes;
  }
}
