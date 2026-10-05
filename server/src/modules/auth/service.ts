import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  currentUserSchema,
  managedUserSchema,
  createUserRequest,
  type CreateUserRequest,
  type UpdateUserRequest,
} from "@habitat/contracts";
import type { AuthConfig } from "./config";
import { AuthRepository, type UserRecord } from "./repository";
import { hashPassword, verifyPassword } from "./password";
import { AuthError } from "./errors";
export const safeUser = (user: UserRecord) => currentUserSchema.parse(user);
export const safeManagedUser = (user: UserRecord) =>
  managedUserSchema.parse(user);
const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export type SessionIdentity = { user: UserRecord; sessionId: string };
export class AuthService {
  constructor(
    readonly repo: AuthRepository,
    readonly config: AuthConfig,
  ) {}
  async createUser(input: CreateUserRequest, actor?: SessionIdentity) {
    const validated = createUserRequest.parse(input);
    const hash = await hashPassword(validated.password);
    return this.repo.db
      .transaction(() => {
        if (actor) this.requireCurrentAdmin(actor);
        return safeManagedUser(this.repo.insert(validated, hash));
      })
      .immediate();
  }
  async bootstrap(input: Omit<CreateUserRequest, "role">) {
    const validated = createUserRequest.parse({ ...input, role: "ADMIN" });
    const hash = await hashPassword(validated.password);
    return this.repo.db
      .transaction(() => {
        if (
          this.repo.db
            .prepare("SELECT id FROM users WHERE role='ADMIN' LIMIT 1")
            .get()
        )
          throw new AuthError(
            409,
            "ADMIN_ALREADY_INITIALIZED",
            "An administrator already exists. Bootstrap refused.",
          );
        return safeManagedUser(this.repo.insert(validated, hash));
      })
      .immediate();
  }
  async login(email: string, password: string, previousToken?: string) {
    const found = this.repo.byEmail(email);
    const valid = await verifyPassword(password, found?.passwordHash);
    if (!found || !valid) throw this.invalidCredentials();
    return this.repo.db
      .transaction(() => {
        // A password reset or disable may have happened while scrypt was running.
        const current = this.repo.require(found.id);
        if (
          current.status !== "ACTIVE" ||
          current.passwordHash !== found.passwordHash ||
          current.email !== found.email
        )
          throw this.invalidCredentials();
        if (previousToken) this.revokeToken(previousToken);
        this.repo.cleanupSessions();
        const token = randomBytes(32).toString("base64url"),
          now = new Date().toISOString();
        this.repo.db
          .prepare(
            "INSERT INTO user_sessions(id,user_id,token_hash,created_at,expires_at,last_used_at) VALUES(?,?,?,?,?,?)",
          )
          .run(
            randomUUID(),
            current.id,
            tokenHash(token),
            now,
            new Date(Date.now() + this.config.ttlMs).toISOString(),
            now,
          );
        this.repo.db
          .prepare("UPDATE users SET last_login_at=? WHERE id=?")
          .run(now, current.id);
        return { token, user: safeUser(current) };
      })
      .immediate();
  }
  private invalidCredentials() {
    return new AuthError(
      401,
      "AUTH_INVALID_CREDENTIALS",
      "Invalid email or password.",
    );
  }
  authenticate(token?: string): SessionIdentity {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new AuthError(401, "AUTH_REQUIRED", "Please sign in.");
    const session = this.repo.db
      .prepare(
        "SELECT id,user_id,expires_at,revoked_at FROM user_sessions WHERE token_hash=?",
      )
      .get(tokenHash(token)) as
      | {
          id: string;
          user_id: string;
          expires_at: string;
          revoked_at: string | null;
        }
      | undefined;
    if (!session || session.revoked_at)
      throw new AuthError(401, "AUTH_REQUIRED", "Please sign in.");
    if (session.expires_at <= new Date().toISOString())
      throw new AuthError(
        401,
        "AUTH_SESSION_EXPIRED",
        "Your session has expired. Please sign in again.",
      );
    const user = this.repo.byId(session.user_id);
    if (!user || user.status !== "ACTIVE")
      throw new AuthError(401, "AUTH_REQUIRED", "Please sign in.");
    this.repo.db
      .prepare("UPDATE user_sessions SET last_used_at=? WHERE id=?")
      .run(new Date().toISOString(), session.id);
    return { user, sessionId: session.id };
  }
  revokeToken(token: string) {
    this.repo.db
      .prepare(
        "UPDATE user_sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL",
      )
      .run(new Date().toISOString(), tokenHash(token));
  }
  // Recheck identity after asynchronous password work, including session revocation.
  requireCurrentIdentity(identity: SessionIdentity) {
    const current = this.repo.require(identity.user.id);
    const session = this.repo.db
      .prepare(
        "SELECT id FROM user_sessions WHERE id=? AND user_id=? AND revoked_at IS NULL AND expires_at>?",
      )
      .get(identity.sessionId, current.id, new Date().toISOString());
    if (!session || current.status !== "ACTIVE")
      throw new AuthError(401, "AUTH_REQUIRED", "Please sign in.");
    return current;
  }
  requireCurrentAdmin(identity: SessionIdentity) {
    if (this.requireCurrentIdentity(identity).role !== "ADMIN")
      throw new AuthError(
        403,
        "AUTH_FORBIDDEN",
        "Administrator access is required.",
      );
  }
  updateUser(id: string, input: UpdateUserRequest) {
    return this.repo.db
      .transaction(() => safeManagedUser(this.repo.update(id, input)))
      .immediate();
  }
  async resetPassword(id: string, password: string, actor: SessionIdentity) {
    this.repo.require(id);
    const hash = await hashPassword(password);
    this.repo.db
      .transaction(() => {
        this.requireCurrentAdmin(actor);
        this.repo.require(id);
        this.repo.db
          .prepare("UPDATE users SET password_hash=?,updated_at=? WHERE id=?")
          .run(hash, new Date().toISOString(), id);
        this.repo.revokeUserSessions(id);
      })
      .immediate();
  }
  async changePassword(
    identity: SessionIdentity,
    currentPassword: string,
    newPassword: string,
  ) {
    if (!(await verifyPassword(currentPassword, identity.user.passwordHash)))
      throw new AuthError(
        400,
        "PASSWORD_CURRENT_INVALID",
        "Current password is incorrect.",
      );
    const hash = await hashPassword(newPassword);
    this.repo.db
      .transaction(() => {
        const current = this.requireCurrentIdentity(identity);
        if (current.passwordHash !== identity.user.passwordHash)
          throw new AuthError(
            409,
            "PASSWORD_CHANGED",
            "Password changed. Please sign in again.",
          );
        this.repo.db
          .prepare("UPDATE users SET password_hash=?,updated_at=? WHERE id=?")
          .run(hash, new Date().toISOString(), current.id);
        this.repo.revokeUserSessions(current.id, identity.sessionId);
      })
      .immediate();
  }
}
