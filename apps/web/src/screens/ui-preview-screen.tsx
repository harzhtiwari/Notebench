"use client";

import React, { useState } from "react";
import {
  // 1. Buttons & Controls
  Button,
  CancelButton,
  KeyTestButton,
  LevelActions,
  SortSelect,
  ViewToggle,
  type DashboardView,

  // 2. Form Controls & Feedback
  Input,
  PasswordInput,
  SearchInput,
  FormField,
  CheckboxRow,
  ReauthField,
  FormatOptionRow,
  FormError,
  FormSuccess,

  // 3. Badges, Chips & Citations
  StatusBadge,
  VersionBadge,
  CloudDisclosureBadge,
  Chip,
  KeywordFallbackChip,
  CitationChip,
  CitationPopover,
  CitationTooltip,

  // 4. Tools & Catalog
  ToolTile,
  RoadmapGrid,
  STUDIO_TOOL_CATALOG,

  // 5. Cards & Emblems
  NotebookCard,
  CreateCard,
  NotebookRow,
  NotebookEmblem,
  NotebookMeta,
  ArtifactPart,
  DiffView,
  PlanCard,
  StatusCard,
  StepsList,
  Flashcard,
  QuizQuestion,

  // 6. Rows, Tables & Usage
  MetricRow,
  ProgressRow,
  HistoryRow,
  OpenInViewerRow,
  TrashRow,
  ArtifactListRow,
  AuditTable,
  TimelineTrack,
  UsageBar,

  // 7. Banners & Indicators
  AlertBanner,
  NoModelBanner,
  GateNotice,
  DraftRecoveryBanner,
  FirstRunBlankState,
  EmptyList,
  RefusalEmpty,
  AutosaveDot,
  SaveState,

  // 8. Modals & Dialogs
  ExportMenu,
  MetricsPopover,
  ConfirmDialog,
  ExportDialog,
  IngestModal,
  LockscreenModal,
  ViewerModal,
  GenerationModal,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Tooltip,
  TooltipTrigger,
  TooltipContent,

  // 9. Shells & Containers
  Composer,
  IconRail,
  Sheet,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  Well,
  WellHeader,
  WellTitle,
  WellDescription,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  TooltipProvider,
  ScrollArea,
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
  EditorShell,
  DropOverlay,
  ProviderRow,
  ProgressStages,

  // 10. Phosphor Icons
  ArrowDown,
  ArrowUp,
  ArrowClockwise,
  Cards,
  ChartBar,
  CheckCircle,
  Circle,
  ClockCounterClockwise,
  Copy,
  Download,
  FileDoc,
  FilePdf,
  FileText,
  Gear,
  Globe,
  Info,
  Lock,
  MagnifyingGlass,
  Notebook,
  PencilSimple,
  Plus,
  Slideshow,
  Question,
  ShieldCheck,
  SidebarSimple,
  Sparkle,
  GitBranch,
  Desktop,
  Warning,
  WarningCircle,
  Heartbeat,
  X,
  Trash,
  DotsThreeVertical,
} from "@notebook/ui";

const sampleNotebook = {
  id: "00000000-0000-0000-0000-000000000001",
  userId: "00000000-0000-0000-0000-000000000002",
  title: "Sample Notebook",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  sourcesCount: 3,
  artifactsCount: 2,
  storageBytes: 1048576,
  sourceFileNames: ["doc.pdf"],
};

export function UiPreviewScreen() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [viewMode, setViewMode] = useState<DashboardView>("grid");
  const [sortKey, setSortKey] = useState<"updated" | "created" | "title" | "size">("updated");
  const [checked, setChecked] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showIngest, setShowIngest] = useState(false);
  const [showLockscreen, setShowLockscreen] = useState(false);
  const [showViewer, setShowViewer] = useState(false);
  const [showGeneration, setShowGeneration] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editorText, setEditorText] = useState("Editable raw text content inside EditorShell...");

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    const root = document.documentElement;
    if (next === "dark") {
      root.classList.add("dark");
      root.setAttribute("data-theme", "dark");
    } else {
      root.classList.remove("dark");
      root.setAttribute("data-theme", "light");
    }
  };

  const icons = [
    { name: "ArrowDown", Icon: ArrowDown },
    { name: "ArrowUp", Icon: ArrowUp },
    { name: "ArrowClockwise", Icon: ArrowClockwise },
    { name: "Cards", Icon: Cards },
    { name: "ChartBar", Icon: ChartBar },
    { name: "CheckCircle", Icon: CheckCircle },
    { name: "Circle", Icon: Circle },
    { name: "ClockCounterClockwise", Icon: ClockCounterClockwise },
    { name: "Copy", Icon: Copy },
    { name: "Download", Icon: Download },
    { name: "FileDoc", Icon: FileDoc },
    { name: "FilePdf", Icon: FilePdf },
    { name: "FileText", Icon: FileText },
    { name: "Gear", Icon: Gear },
    { name: "Globe", Icon: Globe },
    { name: "Info", Icon: Info },
    { name: "Lock", Icon: Lock },
    { name: "MagnifyingGlass", Icon: MagnifyingGlass },
    { name: "Notebook", Icon: Notebook },
    { name: "PencilSimple", Icon: PencilSimple },
    { name: "Plus", Icon: Plus },
    { name: "Slideshow", Icon: Slideshow },
    { name: "Question", Icon: Question },
    { name: "ShieldCheck", Icon: ShieldCheck },
    { name: "SidebarSimple", Icon: SidebarSimple },
    { name: "Sparkle", Icon: Sparkle },
    { name: "GitBranch", Icon: GitBranch },
    { name: "Desktop", Icon: Desktop },
    { name: "Warning", Icon: Warning },
    { name: "WarningCircle", Icon: WarningCircle },
    { name: "Heartbeat", Icon: Heartbeat },
    { name: "X", Icon: X },
    { name: "Trash", Icon: Trash },
    { name: "DotsThreeVertical", Icon: DotsThreeVertical },
  ];

  return (
    <TooltipProvider>
      <div className="h-screen w-full overflow-y-auto bg-[var(--nb-ground)] text-[var(--nb-ink)]">
        <div className="p-8 pb-24 space-y-12 max-w-7xl mx-auto">
          {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-[var(--nb-hairline)] pb-4">
          <div>
            <h1 className="text-2xl font-bold font-[var(--nb-font-ui)]">
              Raw Component Showcase (@notebook/ui)
            </h1>
            <p className="text-xs text-[var(--nb-ink-2)]">
              All 60+ exported components rendered in their raw default states.
            </p>
          </div>
          <Button onClick={toggleTheme}>
            Toggle Theme: {theme.toUpperCase()}
          </Button>
        </div>

        {/* 1. Buttons */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold border-b border-[var(--nb-hairline)] pb-1">
            1. Buttons & Controls
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="default">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
            <Button disabled>Disabled</Button>
            <Button size="sm">Small</Button>
            <Button size="default">Default</Button>
            <Button size="lg">Large</Button>
            <Button size="icon" aria-label="Settings"><Gear size={16} /></Button>
            <CancelButton label="CancelButton" />
            <KeyTestButton state="idle" />
            <ViewToggle value={viewMode} onChange={setViewMode} />
            <SortSelect value={sortKey} onChange={setSortKey} />
          </div>
          <div className="pt-2">
            <LevelActions />
          </div>
        </section>

        {/* 2. Inputs & Forms */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold border-b border-[var(--nb-hairline)] pb-1">
            2. Inputs & Form Controls
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Standard FormField" hint="Helper hint">
              <Input placeholder="Input element..." />
            </FormField>
            <FormField label="Password FormField">
              <PasswordInput placeholder="PasswordInput..." />
            </FormField>
            <FormField label="Search Field">
              <SearchInput placeholder="SearchInput..." />
            </FormField>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ReauthField value="" onChange={() => {}} />
            <div className="space-y-2">
              <CheckboxRow checked={checked} onChange={setChecked}>
                CheckboxRow with accessible label
              </CheckboxRow>
              <FormatOptionRow
                label="Markdown (.md)"
                description="Export as markdown format"
                checked={true}
                onSelect={() => {}}
              />
            </div>
          </div>
          <div className="space-y-2">
            <FormError>FormError banner feedback</FormError>
            <FormSuccess>FormSuccess banner feedback</FormSuccess>
          </div>
        </section>

        {/* 3. Badges, Chips & Citations */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold border-b border-[var(--nb-hairline)] pb-1">
            3. Badges, Chips & Citations
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status="active">Active</StatusBadge>
            <StatusBadge status="error">Error</StatusBadge>
            <StatusBadge status="pending">Pending</StatusBadge>
            <StatusBadge status="cancelled">Cancelled</StatusBadge>
            <VersionBadge milestone="0.2" />
            <CloudDisclosureBadge providerName="Anthropic" />
            <Chip>Chip Default</Chip>
            <KeywordFallbackChip label="Fallback Chip" detail="3 sources" />
            <CitationChip label="p. 12" state="normal" />
            <CitationChip label="p. 14" state="current" />
            <CitationChip label="p. 18" state="missing" />
            <CitationTooltip label="p. 12" title="Source Doc" excerpt="Snippet text" />
            <CitationPopover title="Source Doc" location="p. 12" passage="Passage text">
              <CitationChip label="Popover Chip" />
            </CitationPopover>
          </div>
        </section>

        {/* 4. Containers & Primitives */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold border-b border-[var(--nb-hairline)] pb-1">
            4. Containers & Primitives
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Sheet className="p-4 border border-[var(--nb-hairline)]">
              <SheetHeader>
                <SheetTitle>Sheet Primitive</SheetTitle>
                <SheetDescription>Elevated surface container</SheetDescription>
              </SheetHeader>
            </Sheet>
            <Well className="p-4 border border-[var(--nb-hairline)]">
              <WellHeader>
                <WellTitle>Well Primitive</WellTitle>
                <WellDescription>Recessed container</WellDescription>
              </WellHeader>
            </Well>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="item-1">
                <AccordionTrigger>Accordion Component</AccordionTrigger>
                <AccordionContent>Accordion inner content</AccordionContent>
              </AccordionItem>
            </Accordion>
            <Tabs defaultValue="tab1">
              <TabsList>
                <TabsTrigger value="tab1">Tab 1</TabsTrigger>
                <TabsTrigger value="tab2">Tab 2</TabsTrigger>
              </TabsList>
              <TabsContent value="tab1" className="p-2 text-xs">Tab 1 content</TabsContent>
              <TabsContent value="tab2" className="p-2 text-xs">Tab 2 content</TabsContent>
            </Tabs>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 border border-[var(--nb-hairline)] rounded-[var(--nb-radius-card)] bg-[var(--nb-sheet)]">
              <h3 className="text-xs font-bold text-[var(--nb-ink-2)] mb-2">ScrollArea</h3>
              <ScrollArea className="h-24 w-full rounded border border-[var(--nb-hairline)] p-2">
                <div className="space-y-1 text-xs">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <p key={i}>ScrollArea row item #{i + 1}</p>
                  ))}
                </div>
              </ScrollArea>
            </div>
            <div className="p-4 border border-[var(--nb-hairline)] rounded-[var(--nb-radius-card)] bg-[var(--nb-sheet)]">
              <h3 className="text-xs font-bold text-[var(--nb-ink-2)] mb-2">ResizablePanelGroup</h3>
              <div className="h-24 border border-[var(--nb-hairline)] rounded overflow-hidden">
                <ResizablePanelGroup direction="horizontal">
                  <ResizablePanel defaultSize={50} className="p-2 text-xs flex items-center justify-center bg-[var(--nb-well)]">
                    Left Panel
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={50} className="p-2 text-xs flex items-center justify-center">
                    Right Panel
                  </ResizablePanel>
                </ResizablePanelGroup>
              </div>
            </div>
          </div>
          <div className="p-4 border border-[var(--nb-hairline)] rounded-[var(--nb-radius-card)] bg-[var(--nb-sheet)] space-y-2">
            <h3 className="text-xs font-bold text-[var(--nb-ink-2)]">EditorShell</h3>
            <EditorShell
              value={editorText}
              onChange={setEditorText}
              header={<span className="text-xs font-mono text-[var(--nb-ink-2)]">Draft Auto-Saving Shell</span>}
              footer={<span className="text-xs text-[var(--nb-ink-2)]">{editorText.length} characters</span>}
              rows={3}
            />
          </div>
          <div className="relative p-6 border border-dashed border-[var(--nb-edge)] rounded-[var(--nb-radius-card)] bg-[var(--nb-sheet)] min-h-[140px] flex items-center justify-center">
            <DropOverlay active={true} className="static" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">DropdownMenu</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>Item Option 1</DropdownMenuItem>
                <DropdownMenuItem>Item Option 2</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline">Popover</Button>
              </PopoverTrigger>
              <PopoverContent className="text-xs p-3">
                Popover surface content
              </PopoverContent>
            </Popover>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline">Tooltip (Hover Me)</Button>
              </TooltipTrigger>
              <TooltipContent>Tooltip message preview</TooltipContent>
            </Tooltip>

            <Dialog open={showDialog} onOpenChange={setShowDialog}>
              <DialogTrigger asChild>
                <Button variant="outline">Dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Dialog Primitive</DialogTitle>
                  <DialogDescription>Dialog description and body content.</DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>
          </div>
        </section>

        {/* 5. Cards & Parts */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold border-b border-[var(--nb-hairline)] pb-1">
            5. Cards, Parts & Emblems
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <NotebookCard notebook={sampleNotebook} onOpen={() => {}} />
            <CreateCard onCreate={() => {}} />
            <div className="p-4 border border-[var(--nb-hairline)] rounded-[var(--nb-radius-card)] bg-[var(--nb-sheet)] space-y-2">
              <NotebookEmblem title="Emblem" />
              <NotebookMeta notebook={sampleNotebook} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PlanCard
              title="PlanCard"
              description="Generated plan description"
              costEstimate="Local model"
              items={[{ title: "Section 1", description: "Details" }]}
            />
            <StatusCard
              probe={{
                id: "node_runtime",
                name: "Node Runtime",
                status: "pass",
                message: "v22.0.0",
              }}
            />
          </div>
          <ArtifactPart state="ai" meta="ArtifactPart Header">
            <p className="text-xs">ArtifactPart body content</p>
          </ArtifactPart>
          <DiffView before="Original text chunk" after="Edited text chunk" />
          <StepsList items={[{ id: "1", name: "Step 1", status: "done" }, { id: "2", name: "Step 2", status: "running" }]} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Flashcard card={{ id: "1", front: "Flashcard Front", back: "Flashcard Back", citations: [] }} />
            <QuizQuestion
              question={{
                id: "1",
                prompt: "Quiz question prompt?",
                options: [{ id: "1", text: "Option A" }, { id: "2", text: "Option B" }],
                correctOptionId: "1",
                explanation: "Correct answer is A",
                citations: [],
              }}
            />
          </div>
        </section>

        {/* 6. Rows, Tables & Data Display */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold border-b border-[var(--nb-hairline)] pb-1">
            6. Rows, Tables & Data
          </h2>
          <div className="border border-[var(--nb-hairline)] rounded-[var(--nb-radius-card)] bg-[var(--nb-sheet)] divide-y divide-[var(--nb-hairline)]">
            <NotebookRow notebook={sampleNotebook} onOpen={() => {}} />
            <ArtifactListRow
              id="art-1"
              title="Report Item"
              type="report"
              status="ready"
              updatedAt={Date.now()}
              onOpen={() => {}}
            />
            <OpenInViewerRow onOpen={() => {}}>OpenInViewerRow Item</OpenInViewerRow>
            <TrashRow
              item={{
                id: "1",
                title: "Trashed Item",
                trashedAt: Date.now(),
                type: "notebook",
              }}
              onRestore={() => {}}
              onPurge={() => {}}
            />
            <HistoryRow question="History question query" time="Just now" onSelect={() => {}} />
            <ProgressRow name="Doc.pdf" format="pdf" state="parsing" value={60} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 border border-[var(--nb-hairline)] rounded-[var(--nb-radius-card)] bg-[var(--nb-sheet)] space-y-2">
              <MetricRow label="Metric Label" value="42 units" />
              <UsageBar
                categories={[{ id: "uploads", label: "Uploads", bytes: 420000000 }]}
                capBytes={1000000000}
              />
            </div>
            <div className="p-4 border border-[var(--nb-hairline)] rounded-[var(--nb-radius-card)] bg-[var(--nb-sheet)]">
              <TimelineTrack
                events={[{ id: "1", date: "10:00", title: "Event 1", description: "Details" }]}
              />
            </div>
          </div>
          <AuditTable
            rows={[{ id: "1", control: "Control Item", reader: "Daemon", writer: "Host", status: "pass", milestone: "0.2" }]}
          />
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-[var(--nb-ink-2)]">ProviderRow</h3>
            <ProviderRow name="Anthropic" description="Claude 3.5 Sonnet / Haiku" cloud>
              <KeyTestButton state="idle" />
            </ProviderRow>
            <ProviderRow name="Ollama" description="Local model server (zero telemetry)" cloud={false}>
              <KeyTestButton state="ok" />
            </ProviderRow>
          </div>
          <div className="p-4 border border-[var(--nb-hairline)] rounded-[var(--nb-radius-card)] bg-[var(--nb-sheet)] space-y-2">
            <h3 className="text-xs font-bold text-[var(--nb-ink-2)]">ProgressStages</h3>
            <ProgressStages
              stages={[
                { name: "Reading source documents", status: "done", description: "Done in 1.4s" },
                { name: "Synthesizing study guide", status: "active", progress: 60 },
                { name: "Extracting citations", status: "pending" },
              ]}
              overallProgress={55}
            />
          </div>
        </section>

        {/* 7. Banners & Blank States */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold border-b border-[var(--nb-hairline)] pb-1">
            7. Banners, Blank States & Recovery
          </h2>
          <AlertBanner title="AlertBanner Title" message="Alert banner message text." />
          <NoModelBanner />
          <GateNotice exported={true} />
          <DraftRecoveryBanner onRecover={() => {}} onDiscard={() => {}} />
          <div className="flex items-center gap-6 p-4 border border-[var(--nb-hairline)] rounded-[var(--nb-radius-card)] bg-[var(--nb-sheet)]">
            <AutosaveDot status="saved" />
            <SaveState status="saved" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FirstRunBlankState />
            <EmptyList title="EmptyList Title" description="Empty list description text." />
            <RefusalEmpty message="Refusal empty message text." />
          </div>
        </section>

        {/* 8. Shells & Interactive Tools */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold border-b border-[var(--nb-hairline)] pb-1">
            8. Shells, Rails & Modals Triggers
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <ExportMenu artifactType="report">
              <Button variant="outline">ExportMenu</Button>
            </ExportMenu>
            <MetricsPopover
              metrics={{
                storageUsedBytes: 0,
                storageSafeCapBytes: 5000000000,
                notebookCount: 1,
                sourceCount: 1,
                artifactCount: 1,
              }}
            />
            <IconRail label="Toggle IconRail" onToggle={() => {}} />
            <Button variant="outline" onClick={() => setShowConfirm(true)}>
              Open ConfirmDialog
            </Button>
            <Button variant="outline" onClick={() => setShowExport(true)}>
              Open ExportDialog
            </Button>
            <Button variant="outline" onClick={() => setShowIngest(true)}>
              Open IngestModal
            </Button>
            <Button variant="outline" onClick={() => setShowLockscreen(true)}>
              Open LockscreenModal
            </Button>
            <Button variant="outline" onClick={() => setShowViewer(true)}>
              Open ViewerModal
            </Button>
            <Button variant="outline" onClick={() => setShowGeneration(true)}>
              Open GenerationModal
            </Button>
          </div>
          <Composer onSend={() => {}} placeholder="Composer input component..." />
          <div className="p-4 border border-[var(--nb-hairline)] rounded-[var(--nb-radius-card)] bg-[var(--nb-sheet)]">
            <ToolTile tool={STUDIO_TOOL_CATALOG[0]!} onSelect={() => {}} />
          </div>
          <RoadmapGrid />

          {/* Modal Previews */}
          <ConfirmDialog
            open={showConfirm}
            onOpenChange={setShowConfirm}
            level={1}
            targetName="Preview Cache"
            onConfirm={() => setShowConfirm(false)}
          />

          <ExportDialog
            open={showExport}
            onOpenChange={setShowExport}
            formats={[
              { id: "md", label: "Markdown (.md)", description: "Raw Markdown" },
              { id: "pdf", label: "PDF Document (.pdf)", description: "Formatted document" },
            ]}
          />

          <IngestModal
            open={showIngest}
            onOpenChange={setShowIngest}
          />

          <LockscreenModal
            open={showLockscreen}
            onOpenChange={setShowLockscreen}
            onUnlock={() => setShowLockscreen(false)}
          />

          <ViewerModal
            open={showViewer}
            onOpenChange={setShowViewer}
            title="Sample Source Document.pdf"
            page={1}
            pageCount={12}
            citedPassage="This is an excerpt of a cited passage highlighted in the viewer modal."
          />

          <GenerationModal
            open={showGeneration}
            onOpenChange={setShowGeneration}
            selectedSources={3}
          />
        </section>

        {/* 9. Phosphor Icons Starter Set */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold border-b border-[var(--nb-hairline)] pb-1">
            9. Phosphor Icons
          </h2>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
            {icons.map(({ name, Icon }) => (
              <div
                key={name}
                className="flex flex-col items-center gap-1 p-2 border border-[var(--nb-hairline)] rounded-[var(--nb-radius-card)] bg-[var(--nb-sheet)]"
              >
                <Icon size={20} />
                <span className="text-[10px] font-mono text-[var(--nb-ink-2)] truncate w-full text-center">
                  {name}
                </span>
              </div>
            ))}
          </div>
        </section>
        </div>
      </div>
    </TooltipProvider>
  );
}
