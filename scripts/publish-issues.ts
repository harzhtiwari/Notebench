import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ticketsDir = path.resolve('docs/Project/prd 0.1/tickets');

// Resolve gh executable
let ghPath = 'gh';
const defaultGhWinPath = 'C:\\Program Files\\GitHub CLI\\gh.exe';
if (process.platform === 'win32' && fs.existsSync(defaultGhWinPath)) {
  ghPath = defaultGhWinPath;
}

console.log(`Checking GitHub CLI at: ${ghPath}`);

try {
  const authOutput = execFileSync(ghPath, ['auth', 'status'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  console.log('GitHub CLI is authenticated:');
  console.log(authOutput);
} catch (err: unknown) {
  console.error('\n[WARNING] GitHub CLI is not currently authenticated.');
  console.error('Please run: gh auth login (or set GH_TOKEN environment variable) before running this publisher.');
  process.exit(1);
}

// Read all markdown ticket files except README.md and sort alphabetically for sequential issue numbers
const files = fs.readdirSync(ticketsDir).filter(f => f.endsWith('.md') && f !== 'README.md').sort();

console.log(`Found ${files.length} tickets to publish to GitHub issues...\n`);

// Collect all unique labels and ensure they exist in GitHub repository
const allLabels = new Set<string>();
for (const file of files) {
  const content = fs.readFileSync(path.join(ticketsDir, file), 'utf8');
  const labelLine = content.split('\n').find(l => l.includes('**Labels:**'));
  if (labelLine) {
    const matches = labelLine.matchAll(/`([^`]+)`/g);
    for (const m of matches) {
      if (m[1]) allLabels.add(m[1].trim());
    }
  }
}

console.log(`Ensuring ${allLabels.size} labels exist in GitHub repository...`);
for (const label of allLabels) {
  try {
    let color = '0366d6';
    if (label.startsWith('milestone:')) color = '1d76db';
    else if (label.startsWith('tier:')) color = '5319e7';
    else if (label === 'ready-for-agent') color = '0e8a16';
    execFileSync(ghPath, ['label', 'create', label, '--color', color, '--force'], { stdio: 'ignore' });
  } catch {
    // Ignore if already exists or fails
  }
}
console.log('Labels verified.\n');

for (const file of files) {
  const fullPath = path.join(ticketsDir, file);
  const content = fs.readFileSync(fullPath, 'utf8');

  // Extract Title from line 1
  const firstLine = content.split('\n')[0] ?? '';
  const title = firstLine.replace(/^#\s*/, '').trim();

  // Extract Labels from frontmatter line
  const labelLine = content.split('\n').find(l => l.includes('**Labels:**'));
  const labels: string[] = [];
  if (labelLine) {
    const matches = labelLine.matchAll(/`([^`]+)`/g);
    for (const m of matches) {
      if (m[1]) labels.push(m[1].trim());
    }
  }

  console.log(`Publishing: "${title}" (Labels: ${labels.join(', ')})`);

  try {
    const args = ['issue', 'create', '--title', title, '--body-file', fullPath];
    for (const label of labels) {
      args.push('--label', label);
    }

    const result = execFileSync(ghPath, args, { encoding: 'utf8' });
    console.log(`  -> Created issue: ${result.trim()}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  -> Failed to create issue for ${file}: ${message}`);
  }
}

console.log('\nAll tickets processed.');
