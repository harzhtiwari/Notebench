import type {
  DocxBlock,
  DocxExtractorPort,
  DocxExtractResult,
} from "@notebook/contracts";

export interface ParsedDocxDocument {
  totalCharacters: number;
  totalWords: number;
  totalParagraphs: number;
  totalTables: number;
  metadata: Record<string, string>;
  blocks: DocxBlock[];
  plainText: string;
}

export class DocxParserService {
  constructor(private readonly extractor: DocxExtractorPort) {}

  public async parse(filePath: string): Promise<ParsedDocxDocument> {
    const result: DocxExtractResult = await this.extractor.extractDocx(filePath);

    const plainText = result.blocks.map((b) => b.text).join("\n\n");

    return {
      totalCharacters: result.totalCharacters,
      totalWords: result.totalWords,
      totalParagraphs: result.totalParagraphs,
      totalTables: result.totalTables,
      metadata: result.metadata,
      blocks: result.blocks,
      plainText,
    };
  }
}
