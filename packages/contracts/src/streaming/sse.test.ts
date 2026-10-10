import { describe, it, expect } from "vitest";
import { SseEventSchema } from "./sse.js";

describe("SSE Realtime Streaming Event Union", () => {
  it("validates start event", () => {
    const valid = {
      type: "start",
      runId: "run-001",
      threadId: "thread-001",
      model: "gemini-2.5-pro",
      timestamp: Date.now(),
    };
    const res = SseEventSchema.safeParse(valid);
    expect(res.success).toBe(true);
  });

  it("validates chunk event with textDelta and thinkingDelta", () => {
    const valid = {
      type: "chunk",
      textDelta: "Hello world",
      thinkingDelta: "Let me think...",
    };
    const res = SseEventSchema.safeParse(valid);
    expect(res.success).toBe(true);
  });

  it("validates citation event with boundingBox coordinates", () => {
    const valid = {
      type: "citation",
      citationId: "cite-123",
      fileId: "doc-456",
      fileName: "annual-report.pdf",
      pageNumber: 12,
      boundingBox: [0.1, 0.2, 0.8, 0.4] as [number, number, number, number],
      snippet: "Revenue grew 42% year-over-year.",
    };
    const res = SseEventSchema.safeParse(valid);
    expect(res.success).toBe(true);
  });

  it("rejects citation event with invalid boundingBox coordinates", () => {
    const invalid = {
      type: "citation",
      citationId: "cite-123",
      fileId: "doc-456",
      fileName: "annual-report.pdf",
      pageNumber: 12,
      boundingBox: [0.1, 0.2], // Requires exactly 4 coordinates
      snippet: "Invalid bounding box",
    };
    const res = SseEventSchema.safeParse(invalid);
    expect(res.success).toBe(false);
  });

  it("validates artifact_patch event for surgical editing", () => {
    const valid = {
      type: "artifact_patch",
      artifactId: "art-1",
      slideId: "slide-1",
      blockId: "block-1",
      expectedPreHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      siblingHashes: {
        "block-2": "a3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      },
      replacementContent: {
        type: "stat_metric",
        id: "block-1",
        value: "99.9%",
        label: "Uptime SLA",
      },
    };
    const res = SseEventSchema.safeParse(valid);
    expect(res.success).toBe(true);
  });

  it("validates error event with typed code and retryable flag", () => {
    const valid = {
      type: "error",
      code: "RATE_LIMITED",
      message: "Upstream rate limit exceeded",
      retryable: true,
      statusCode: 429,
    };
    const res = SseEventSchema.safeParse(valid);
    expect(res.success).toBe(true);
  });
});
