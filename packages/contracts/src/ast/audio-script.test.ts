import { describe, it, expect } from "vitest";
import { AudioScriptASTSchema } from "./audio-script.js";

describe("Two-Host Audio Script AST (AudioScriptAST)", () => {
  it("validates a structured two-host dialogue script", () => {
    const validScript = {
      schemaVersion: 1,
      id: "audio-script-001",
      title: "Deep Dive: Autonomous RAG Architectures",
      hosts: {
        host1: {
          name: "Alex",
          persona: "Inquisitive investigative host",
          voiceId: "voice_alex_en",
        },
        host2: {
          name: "Sam",
          persona: "Deep domain expert engineer",
          voiceId: "voice_sam_en",
        },
      },
      turns: [
        {
          id: "turn-1",
          speaker: "host1" as const,
          text: "Welcome back! Today we are looking into surgical document patching.",
          tone: "enthusiastic" as const,
          pacing: "normal" as const,
        },
        {
          id: "turn-2",
          speaker: "host2" as const,
          text: "Right! Instead of regenerating entire slides, we verify sibling SHA-256 hashes.",
          tone: "thoughtful" as const,
          pacing: "normal" as const,
          citations: [
            {
              citationId: "cite-patch",
              fileId: "file-spec",
              fileName: "ARCHITECTURE.md",
              pageNumber: 1,
              boundingBox: [0.0, 0.0, 1.0, 1.0] as [number, number, number, number],
              snippet: "Surgical block patch verification",
            },
          ],
        },
      ],
      soundCues: [
        {
          id: "cue-intro",
          type: "intro_jingle" as const,
          atTurnId: "turn-1",
          position: "before" as const,
        },
      ],
    };

    const result = AudioScriptASTSchema.safeParse(validScript);
    expect(result.success).toBe(true);
  });
});
