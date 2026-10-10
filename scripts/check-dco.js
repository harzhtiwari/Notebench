import fs from 'node:fs';

const commitMsgFile = process.argv[2];
if (!commitMsgFile || !fs.existsSync(commitMsgFile)) {
  console.error('ERROR: Commit message file not found:', commitMsgFile);
  process.exit(1);
}

const content = fs.readFileSync(commitMsgFile, 'utf8');
if (!/^Signed-off-by:\s+.+/m.test(content)) {
  console.error('\nERROR: Every commit must include a DCO sign-off (git commit -s).\n');
  process.exit(1);
}
