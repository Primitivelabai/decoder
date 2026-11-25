// Installs the decoder skill into an agent's skills folder and records this checkout's path.
//
//   npm run install-skill -- <agent>      claude | codex | agents | gemini | copilot | cursor
//   npm run install-skill -- --dir <path> any skills folder
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TARGETS = {
  claude: ['.claude', 'skills'],
  codex: ['.codex', 'skills'],
  agents: ['.agents', 'skills'],
  gemini: ['.gemini', 'skills'],
  copilot: ['.copilot', 'skills'],
  cursor: ['.cursor', 'skills'],
};

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(repoRoot, 'skills', 'decoder');
const [first, second] = process.argv.slice(2);

let skillsDir;
if (first === '--dir' && second) skillsDir = resolve(second);
else if (first && TARGETS[first]) skillsDir = join(homedir(), ...TARGETS[first]);
else {
  console.error(`Usage: npm run install-skill -- <${Object.keys(TARGETS).join('|')}>`);
  console.error('       npm run install-skill -- --dir <skills folder>');
  process.exit(1);
}

const destination = join(skillsDir, 'decoder');
mkdirSync(skillsDir, { recursive: true });
rmSync(destination, { recursive: true, force: true });
cpSync(source, destination, { recursive: true });
writeFileSync(join(destination, 'DECODER_HOME.txt'), `${repoRoot}\n`);
console.log(`Installed decoder skill to ${destination}`);
