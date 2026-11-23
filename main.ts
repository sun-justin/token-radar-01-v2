// Launch Radar v2 — token-radar-01 entry (Node 22, standard library only, no network).
//
// Reads the sealed snapshot, fits the value model on its token-bearing peers,
// tests the fit held-out twice, ranks every protocol in the snapshot by
// implied value (all 758: pre-token by the model, live by their market cap,
// token-recorded-but-unpriced by the model with a flag), and writes the board,
// the dashboard data, the dashboard and screenshots, and the dossier the
// judge reads. Every row carries a verdict, its token odds from its
// category's record, its held-out error band, and a farm plan costed in
// dollars per active hour.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|dir>
//
// The grader runs it as `node main.ts` with /input mounted and /output writable;
// both runs must write the same bytes, so nothing here reads the clock, the
// network or any randomness: the only input is the snapshot file.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps: the text cap shapes the dossier bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`launch radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`launch radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`launch radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`launch radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

const held = radar.held_out.map((h) => `${h.name.split(' — ')[0]}: median |log error| ${h.median_abs_log_error}, ${Math.round(h.within_2x * 100)}% within 2x (baseline ${h.baseline_median_abs_log_error})`).join('; ');
const byStatus = (s: string): number => board.filter((r) => r.token_status === s).length;
const verdicts = board.reduce<Record<string, number>>((m, r) => {
  m[r.verdict] = (m[r.verdict] ?? 0) + 1;
  return m;
}, {});
const verdictLine = Object.entries(verdicts)
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `${k} ${v}`)
  .join(', ');
const perHour = board.map((r) => r.farm.cost_per_hour);
const firstPreToken = board.filter((r) => r.radar_rank === 1)[0]!;
const firstPreTokenByValue = board.filter((r) => r.token_status === 'pre-token')[0]!;
process.stdout.write(
  `launch radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${radar.fit.peers} token peers fitted (log mcap = ${radar.fit.intercept} + ${radar.fit.tvl_exponent} * log tvl)\n` +
    `launch radar: held-out twice — ${held}\n` +
    `launch radar: ${board.length} rows scored (${byStatus('pre-token')} pre-token, ${byStatus('live')} live, ${byStatus('token-unpriced')} unpriced; ${board.filter((r) => r.watchlist).length} watchlist), total implied $${radar.total_implied_board.toLocaleString('en-US')} ($${radar.total_implied_pretoken.toLocaleString('en-US')} model-implied + $${radar.total_mcap_live.toLocaleString('en-US')} live market caps)\n` +
    `launch radar: verdicts — ${verdictLine}\n` +
    `launch radar: token odds from each category's record (global ${(radar.global_token_rate * 100).toFixed(1)}% record a token); farm plans cost $${Math.min(...board.map((r) => r.farm.cost_usd))}–$${Math.max(...board.map((r) => r.farm.cost_usd))} gas over ${Math.min(...board.map((r) => r.farm.active_minutes))}–${Math.max(...board.map((r) => r.farm.active_minutes))} active minutes, $${Math.min(...perHour).toFixed(2)}–$${Math.max(...perHour).toFixed(2)}/h; error band x${radar.error_band_factor}\n` +
    `launch radar: radar #1 is ${firstPreToken.name} at $${firstPreToken.implied_value_usd.toLocaleString('en-US')} implied (global rank #${firstPreToken.rank}); largest pre-token value overall is ${firstPreTokenByValue.name} at $${firstPreTokenByValue.implied_value_usd.toLocaleString('en-US')} (${firstPreTokenByValue.verdict})\n` +
    `launch radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (3 files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
