import React from "react";
import { WorkspaceShell } from "../components/workspace-shell";
import { Well, WellTitle, WellDescription, Button, Input } from "@notebook/ui";

export default function HomePage() {
  const sourcesContent = (
    <div className="flex flex-col gap-2">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-[var(--nb-ink-2)]">2 sources in context</span>
        <Button variant="outline" size="sm" className="h-7 text-xs">
          + Add sources
        </Button>
      </div>
      <Well className="p-3">
        <div className="flex items-start justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-[var(--nb-ink)]">
              [x] DARPA_Challenge.pdf
            </span>
            <span className="text-[11px] text-[var(--nb-ink-2)]">
              48 pages, 142 chunks
            </span>
          </div>
          <span className="rounded bg-[var(--nb-sheet)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--nb-ink-2)]">
            PDF
          </span>
        </div>
      </Well>
      <Well className="p-3">
        <div className="flex items-start justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-[var(--nb-ink)]">
              [x] Q3_Financial_Review.docx
            </span>
            <span className="text-[11px] text-[var(--nb-ink-2)]">
              12 pages, 34 chunks
            </span>
          </div>
          <span className="rounded bg-[var(--nb-sheet)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--nb-ink-2)]">
            DOCX
          </span>
        </div>
      </Well>
    </div>
  );

  const centerContent = (
    <div className="flex flex-col gap-4 font-[var(--nb-font-read)] text-[15px] leading-relaxed text-[var(--nb-ink)]">
      <div className="font-[var(--nb-font-ui)] text-xs font-semibold text-[var(--nb-ink-2)]">
        Executive research briefing
      </div>
      <p>
        Autonomous navigation benchmarks accelerated dramatically across military trial corridors,{" "}
        <span className="bg-[var(--nb-marker-swipe)] px-0.5">
          with obstacle clearance latency dropping below 14ms across complex off-road environments
        </span>
        <button
          type="button"
          aria-label="Source 1, DARPA_Challenge.pdf, page 24"
          className="ml-1 inline-flex items-center rounded-xs bg-[var(--nb-marker-wash)] px-1 text-[11px] font-bold text-[var(--nb-on-marker)] hover:outline-2 hover:outline-[var(--nb-marker)]"
        >
          1
        </button>
        . Meanwhile, financial telemetry confirmed that capital expenditure remained within allocated thresholds{" "}
        <span className="bg-[var(--nb-marker-swipe)] px-0.5">
          during the second quarter hardware deployment phase
        </span>
        <button
          type="button"
          aria-label="Source 2, Q3_Financial_Review.docx, page 5"
          className="ml-1 inline-flex items-center rounded-xs bg-[var(--nb-marker-wash)] px-1 text-[11px] font-bold text-[var(--nb-on-marker)] hover:outline-2 hover:outline-[var(--nb-marker)]"
        >
          2
        </button>
        .
      </p>
      <p className="font-[var(--nb-font-ui)] text-xs text-[var(--nb-ink-2)]">
        Notebench generates answers grounded in your sources. Always verify citations.
      </p>
    </div>
  );

  const composerContent = (
    <div className="flex items-center gap-2">
      <Input
        placeholder="Ask questions grounded in selected sources..."
        className="h-9 border-[var(--nb-edge)] bg-[var(--nb-ground)] text-xs"
      />
      <Button size="sm" className="h-9 px-4 text-xs font-medium">
        Send
      </Button>
    </div>
  );

  const studioContent = (
    <div className="flex flex-col gap-3">
      <div className="text-xs font-medium text-[var(--nb-ink-2)]">Living artifacts</div>
      <div className="grid grid-cols-2 gap-2">
        <Well className="cursor-pointer p-2.5 transition-colors hover:border-[var(--nb-ink-2)]">
          <WellTitle className="text-xs font-semibold">Report</WellTitle>
          <WellDescription className="text-[10px] text-[var(--nb-ink-2)]">Synthesis document</WellDescription>
        </Well>
        <Well className="cursor-pointer p-2.5 transition-colors hover:border-[var(--nb-ink-2)]">
          <WellTitle className="text-xs font-semibold">Study guide</WellTitle>
          <WellDescription className="text-[10px] text-[var(--nb-ink-2)]">Learning outline</WellDescription>
        </Well>
        <Well className="cursor-pointer p-2.5 transition-colors hover:border-[var(--nb-ink-2)]">
          <WellTitle className="text-xs font-semibold">FAQ</WellTitle>
          <WellDescription className="text-[10px] text-[var(--nb-ink-2)]">Questions and answers</WellDescription>
        </Well>
        <Well className="cursor-pointer p-2.5 transition-colors hover:border-[var(--nb-ink-2)]">
          <WellTitle className="text-xs font-semibold">Flashcards</WellTitle>
          <WellDescription className="text-[10px] text-[var(--nb-ink-2)]">Review deck</WellDescription>
        </Well>
        <Well className="cursor-pointer p-2.5 transition-colors hover:border-[var(--nb-ink-2)]">
          <WellTitle className="text-xs font-semibold">Quiz</WellTitle>
          <WellDescription className="text-[10px] text-[var(--nb-ink-2)]">Assessment test</WellDescription>
        </Well>
        <Well className="p-2.5 opacity-60">
          <WellTitle className="text-xs font-semibold">Slide deck</WellTitle>
          <WellDescription className="text-[10px] text-[var(--nb-ink-2)]">
            Coming in 0.2
          </WellDescription>
        </Well>
      </div>
    </div>
  );

  return (
    <WorkspaceShell
      sourcesSlot={sourcesContent}
      centerSlot={centerContent}
      composerSlot={composerContent}
      studioSlot={studioContent}
    />
  );
}
