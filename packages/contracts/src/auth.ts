import { z } from "zod";
import { userRoleSchema, userStatusSchema } from "@habitat/domain";
import { displayPreferencesSchema } from "./display";
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .max(PASSWORD_MAX_LENGTH);
const email = z.string().trim().toLowerCase().email().max(254);
const name = z.string().trim().min(1).max(120);
export const loginRequest = z
  .object({ email, password: z.string().min(1).max(PASSWORD_MAX_LENGTH) })
  .strict();
export const currentUserSchema = displayPreferencesSchema.extend({
  id: z.string().uuid(),
  name,
  email,
  role: userRoleSchema,
  status: userStatusSchema,
});
export const managedUserSchema = currentUserSchema.extend({
  createdAt: z.string(),
  updatedAt: z.string(),
  lastLoginAt: z.string().nullable(),
});
export const createUserRequest = z
  .object({ name, email, role: userRoleSchema, password: passwordSchema })
  .strict();
export const updateUserRequest = z
  .object({
    name: name.optional(),
    email: email.optional(),
    role: userRoleSchema.optional(),
    status: userStatusSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Provide at least one field.");
export const updateAccountRequest = z.object({ name }).strict();
export const changePasswordRequest = z
  .object({
    currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
    newPassword: passwordSchema,
  })
  .strict();
export const adminResetPasswordRequest = z
  .object({ newPassword: passwordSchema })
  .strict();
export type LoginRequest = z.infer<typeof loginRequest>;
export type CurrentUser = z.infer<typeof currentUserSchema>;
export type ManagedUser = z.infer<typeof managedUserSchema>;
export type CreateUserRequest = z.infer<typeof createUserRequest>;
export type UpdateUserRequest = z.infer<typeof updateUserRequest>;
export type ChangePasswordRequest = z.infer<typeof changePasswordRequest>;
export type AdminResetPasswordRequest = z.infer<
  typeof adminResetPasswordRequest
>;
