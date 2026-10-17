import { z } from "zod";

export const SettingsPageIdSchema = z.enum([
  "account",
  "models",
  "preferences",
  "memory",
  "storage",
  "privacy",
  "health",
]);
export type SettingsPageId = z.infer<typeof SettingsPageIdSchema>;

export const SettingControlKindSchema = z.enum([
  "toggle",
  "select",
  "input",
  "button",
  "custom",
]);
export type SettingControlKind = z.infer<typeof SettingControlKindSchema>;

export const TargetMilestoneSchema = z.enum(["0.2", "0.3", "later"]);
export type TargetMilestone = z.infer<typeof TargetMilestoneSchema>;

/**
 * Discriminated union for setting operational status.
 * Mandates that disabled controls provide an explicit roadmap milestone and rationale.
 */
export const SettingStatusSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("enabled"),
  }),
  z.object({
    state: z.literal("disabled"),
    until: TargetMilestoneSchema,
    reason: z
      .string()
      .min(10, "Disabled settings must provide an explicit explanation >= 10 chars"),
  }),
]);
export type SettingStatus = z.infer<typeof SettingStatusSchema>;

export interface SelectOption {
  readonly label: string;
  readonly value: string;
  readonly disabled?: boolean | undefined;
  readonly until?: TargetMilestone | undefined;
}

export interface SettingDefinition<T = unknown> {
  readonly id: string;
  readonly page: SettingsPageId;
  readonly section: string;
  readonly label: string;
  readonly description?: string | undefined;
  readonly control: SettingControlKind;
  readonly status: SettingStatus;
  readonly defaultValue: T;
  readonly valueSchema: z.ZodType<T>;
  readonly options?: readonly SelectOption[] | undefined;
  readonly inputType?: ("text" | "password" | "number" | "url") | undefined;
  readonly placeholder?: string | undefined;
  readonly buttonText?: string | undefined;
  readonly isDestructive?: boolean | undefined;
  readonly requiresPasscode?: boolean | undefined;
}

export interface SettingsSection {
  readonly id: string;
  readonly page: SettingsPageId;
  readonly title: string;
  readonly description?: string | undefined;
  readonly order: number;
}
