// Token Radar: reads the sealed snapshot, builds the board with the
// model in lib/model.js, writes board.json, the dashboard (with its data
// file generated beside the page), the screenshots and dossier.json.
//
//   node main.ts [--input /input/snapshot.json]
//   MAKEFUN_OUTPUT_DIR overrides the output directory (default /output).

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRadar } from './lib/model.js';
import { buildDossier } from './vendor/makefun-board.ts';

const here = dirname(fileURLToPath(import.meta.url));

function argValue(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

const inputPath = argValue('--input') || '/input/snapshot.json';
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

const snapshot = JSON.parse(readFileSync(inputPath, 'utf8'));
const radar = buildRadar(snapshot);

mkdirSync(outDir, { recursive: true });

// The ranked board.
writeFileSync(join(outDir, 'board.json'), JSON.stringify({ rows: radar.rows }) + '\n');

// The dashboard and screenshots, copied from this repository.
cpSync(join(here, 'dashboard'), join(outDir, 'dashboard'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// The dashboard's data, written beside the page: the sealed snapshot the
// page recomputes its board from, and the checksum it must reproduce.
const dataJs =
  'export const SNAPSHOT = ' + JSON.stringify(snapshot) + ';\n' +
  'export const EXPECTED_CHECKSUM = ' + JSON.stringify(radar.checksum) + ';\n';
writeFileSync(join(outDir, 'dashboard', 'zz-snapshot-data.js'), dataJs);

// The dossier, exactly as the kit's library writes it.
const dossier = buildDossier(outDir, { text_max_bytes: 65536 });
writeFileSync(join(outDir, 'dossier.json'), dossier);

console.log('rows', radar.rows.length, 'checksum', radar.checksum,
  'value LOO x' + radar.value.loo.toFixed(2), 'WF x' + radar.value.wf.toFixed(2),
  'odds Brier CV', radar.odds.cv.toFixed(4), 'WF', radar.odds.wf.toFixed(4));
