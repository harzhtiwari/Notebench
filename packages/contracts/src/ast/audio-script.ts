import { z } from "zod";
import { CitationAttrsSchema } from "./document.js";

export const HostProfileSchema = z.object({
  name: z.string().min(1),
  persona: z.string().min(1),
  voiceId: z.string().min(1),
});
export type HostProfile = z.infer<typeof HostProfileSchema>;

export const SpeakerTurnToneSchema = z.enum([
  "enthusiastic",
  "skeptical",
  "thoughtful",
  "humorous",
  "clarifying",
]);
export type SpeakerTurnTone = z.infer<typeof SpeakerTurnToneSchema>;

export const SpeakerTurnPacingSchema = z.enum(["slow", "normal", "fast"]);
export type SpeakerTurnPacing = z.infer<typeof SpeakerTurnPacingSchema>;

export const SpeakerTurnSchema = z.object({
  id: z.string().min(1),
  speaker: z.enum(["host1", "host2"]),
  text: z.string().min(1),
  tone: SpeakerTurnToneSchema.default("thoughtful"),
  pacing: SpeakerTurnPacingSchema.default("normal"),
  pauseAfterMs: z.number().int().nonnegative().optional(),
  citations: z.array(CitationAttrsSchema).optional(),
});
export type SpeakerTurn = z.infer<typeof SpeakerTurnSchema>;

export const SoundCueTypeSchema = z.enum([
  "intro_jingle",
  "whoosh",
  "chuckle",
  "transition_chime",
]);
export type SoundCueType = z.infer<typeof SoundCueTypeSchema>;

export const SoundCueSchema = z.object({
  id: z.string().min(1),
  type: SoundCueTypeSchema,
  atTurnId: z.string().min(1),
  position: z.enum(["before", "after"]),
});
export type SoundCue = z.infer<typeof SoundCueSchema>;

export const AudioScriptASTSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  title: z.string().min(1),
  hosts: z.object({
    host1: HostProfileSchema,
    host2: HostProfileSchema,
  }),
  turns: z.array(SpeakerTurnSchema),
  soundCues: z.array(SoundCueSchema).default([]),
});
export type AudioScriptAST = z.infer<typeof AudioScriptASTSchema>;
