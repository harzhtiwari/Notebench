import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ticketsDir = path.resolve('docs/Project/prd 0.1/tickets');

// Map of ticket issue numbers to their blocking ticket numbers
const dependencyMap: Record<number, number[]> = {
  1: [],
  2: [1],
  3: [1],
  4: [1, 2, 3],
  5: [1],
  6: [4, 5],
  7: [6],
  8: [4],
  9: [8],
  10: [8],
  11: [8],
  12: [11],
  13: [9, 10, 11],
  14: [8],
  15: [14],
  16: [15],
  17: [16],
  18: [1],
  19: [18],
  20: [2, 18],
  21: [16, 18],
  22: [6, 21],
  23: [19, 22],
  24: [22],
  25: [22],
  26: [18],
  27: [4, 26],
  28: [27],
  29: [27],
  30: [27],
  31: [27],
  32: [1],
  33: [2, 4],
  34: [32, 33],
  35: [2],
  36: [35],
  37: [36],
  38: [35],
  39: [2],
  40: [39],
  41: [4, 8],
  42: [41],
  43: [42],
  44: [40],
};

const defaultGhWinPath = 'C:\\Program Files\\GitHub CLI\\gh.exe';
let ghPath = 'gh';
if (process.platform === 'win32' && fs.existsSync(defaultGhWinPath)) {
  ghPath = defaultGhWinPath;
}

const files = fs.readdirSync(ticketsDir).filter(f => f.endsWith('.md') && f !== 'README.md').sort();

console.log(`Processing ${files.length} ticket files for dependency retrofit...\n`);

for (let i = 0; i < files.length; i++) {
  const file = files[i]!;
  const issueNum = i + 1;
  const blockers = dependencyMap[issueNum] ?? [];
  const fullPath = path.join(ticketsDir, file);
  let content = fs.readFileSync(fullPath, 'utf8');

  // Format blocker text
  const blockerText = blockers.length === 0
    ? 'None (can start immediately)'
    : blockers.map(b => `#${b}`).join(', ');

  // 1. Update frontmatter metadata
  const blockedByLine = `> **Blocked by:** ${blockerText}  `;
  if (content.includes('**Blocked by:**')) {
    content = content.replace(/> \*\*Blocked by:\*\*.*$/m, blockedByLine);
  } else {
    // Insert after Labels line
    content = content.replace(/(> \*\*Labels:\*\*.*?\n)/, `$1${blockedByLine}\n`);
  }

  // 2. Add or update ## Blocked by section under Specification
  const blockedBySection = `\n### Blocked by\n${
    blockers.length === 0
      ? '- None (can start immediately)'
      : blockers.map(b => `- #${b}`).join('\n')
  }\n`;

  if (content.includes('### Blocked by')) {
    content = content.replace(/### Blocked by[\s\S]*?(?=\n---|\n## )/, blockedBySection.trim() + '\n\n');
  } else {
    // Insert after Target Packages & Files
    content = content.replace(/(### 1\.2 Target Packages & Files[\s\S]*?\n)(?=\n---)/, `$1${blockedBySection}`);
  }

  fs.writeFileSync(fullPath, content, 'utf8');
  console.log(`Updated local ticket ${file} -> Blocked by: ${blockerText}`);

  // 3. Update GitHub issue body if not closed (#1 and #2 are closed, but we can update bodies for all or open ones)
  try {
    execFileSync(ghPath, ['issue', 'edit', String(issueNum), '--body-file', fullPath], { encoding: 'utf8' });
    console.log(`  -> Successfully updated GitHub issue #${issueNum}`);
  } catch (err) {
    console.warn(`  -> Could not update GitHub issue #${issueNum}: ${String(err)}`);
  }
}

console.log('\nDependency retrofit complete!');
