import { z } from "zod";

export const UserRoleSchema = z.enum(["owner", "member"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserSchema = z.object({
  id: z.uuid(),
  email: z.email().optional(),
  displayName: z.string().optional(),
  passcodeHash: z.string().optional(),
  role: UserRoleSchema.default("owner"),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type User = z.infer<typeof UserSchema>;

export const CreateUserInputSchema = z.object({
  email: z.email().optional(),
  displayName: z.string().optional(),
  passcode: z.string().min(4).optional(),
});
export type CreateUserInput = z.infer<typeof CreateUserInputSchema>;
