import { createLogger } from "@notebench/logger";
import { DocumentASTSchema, type DocumentAST } from "@notebench/contracts";

// 1. Initialize structured logger
const logger = createLogger({
  name: "example-basic-usage",
  level: "info",
});

logger.info("Initializing Notebench Basic Usage Example...");

// 2. Build a Document AST conforming to Notebench schema specifications
const docData: DocumentAST = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Welcome to Notebench",
        },
      ],
    },
  ],
};

// 3. Validate against contracts schema
try {
  const validated = DocumentASTSchema.parse(docData);
  logger.info(
    {
      contentType: validated.type,
      nodeCount: validated.content.length,
    },
    "Successfully validated Document AST against @notebench/contracts"
  );
  console.log("Example completed successfully!");
} catch (error) {
  logger.error({ err: error }, "Failed to validate DocumentAST");
  process.exit(1);
}

