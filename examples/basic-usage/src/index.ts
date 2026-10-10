import { createLogger } from "@notebook/logger";
import { DeckASTSchema, type DeckAST } from "@notebook/contracts";

// 1. Initialize structured logger
const logger = createLogger({
  name: "example-basic-usage",
  level: "info",
});

logger.info("Initializing Notebench Basic Usage Example...");

// 2. Build a Slide Deck AST conforming to Notebench schema specifications
const deckData: DeckAST = {
  schemaVersion: 1,
  id: "deck-example-01",
  title: "Notebench Quickstart Synthesis",
  theme: {
    palette: "slate-minimal",
    primaryColor: "#0f172a",
    accentColor: "#3b82f6",
    fontFamily: "Inter, sans-serif",
  },
  slides: [
    {
      id: "slide-1",
      layout: "title",
      speakerNotes: "Welcome and introduction to Notebench ASTs.",
      blocks: [
        {
          id: "block-title",
          type: "title",
          text: "Welcome to Notebench",
        },
        {
          id: "block-subtitle",
          type: "subtitle",
          text: "Open-source living document synthesis engine",
        },
      ],
    },
    {
      id: "slide-2",
      layout: "metrics",
      blocks: [
        {
          id: "block-metric",
          type: "stat_metric",
          value: "100%",
          label: "Compile-Time Type Safety",
          trend: "up",
        },
      ],
    },
  ],
};

// 3. Validate against contracts schema
try {
  const validated = DeckASTSchema.parse(deckData);
  logger.info(
    {
      deckId: validated.id,
      slideCount: validated.slides.length,
      theme: validated.theme.palette,
    },
    "Successfully validated Slide Deck AST against @notebook/contracts"
  );
  console.log("Example completed successfully!");
} catch (error) {
  logger.error({ err: error }, "Failed to validate DeckAST");
  process.exit(1);
}
