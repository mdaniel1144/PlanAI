import { z } from "zod";
export const userRoleSchema = z.enum(["ADMIN", "USER"]);
export const userStatusSchema = z.enum(["ACTIVE", "DISABLED"]);
export type UserRole = z.infer<typeof userRoleSchema>;
export type UserStatus = z.infer<typeof userStatusSchema>;
