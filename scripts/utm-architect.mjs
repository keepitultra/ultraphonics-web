#!/usr/bin/env node
/**
 * UTM Architect — Ultraphonics Campaign URL Tool
 *
 * Commands:
 *   build      Build a normalized, tagged URL
 *   validate   Check an existing URL for UTM compliance
 *   check      Ping a short link and verify UTMs survive the redirect
 *   check-all  Ping all links defined in utm-links.json
 *   presets    List established UTM patterns for this project
 *   ga4-config Print the exact GA4 Custom Channel Group setup instructions
 *
 * Examples:
 *   node scripts/utm-architect.mjs build --preset offline --campaign gig_banner
 *   node scripts/utm-architect.mjs validate "https://ultraphonicsmusic.com?utm_source=qr_code&utm_medium=offline&utm_campaign=gig_banner"
 *   node scripts/utm-architect.mjs check https://tiny.cc/up-request
 *   node scripts/utm-architect.mjs check-all
 *   node scripts/utm-architect.mjs ga4-config
 */

import { URL } from 'node:url';
import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── 2026 GA4 Standard: canonical parameter order ─────────────────────────────
const PARAM_ORDER = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const REQUIRED    = ['utm_source', 'utm_medium', 'utm_campaign'];

const BASE_URL = 'https://ultraphonicsmusic.com';

// ── Ultraphonics established UTM patterns ────────────────────────────────────
// Rule: source=qr_code | medium=offline | campaign=[location_material]
//       source=[platform]  | medium=social  | campaign=[post_type]
const PRESETS = {
  offline:   { utm_source: 'qr_code',   utm_medium: 'offline' },
  facebook:  { utm_source: 'facebook',  utm_medium: 'social'  },
  youtube:   { utm_source: 'youtube',   utm_medium: 'social'  },
  instagram: { utm_source: 'instagram', utm_medium: 'social'  },
};

// Current live campaigns (from campaigns.csv)
const KNOWN_OFFLINE_CAMPAIGNS = ['gig_banner', 'koozie', 'business_card', 'weddings_flyer'];
// Recommended future taxonomy — one campaign per objective, use utm_content for the specific creative
// Do NOT encode song names or dates in utm_campaign (use utm_content for that)
const KNOWN_SOCIAL_CAMPAIGNS  = [
  'fan_engagement',       // general audience posts (replaces: 2026_survey_post, cover_photo)
  'wedding_booking',      // posts targeting wedding clients → /quote (replaces: weddings, book_us_for_your_next_event)
  'youtube_content',      // YouTube video posts (replaces: 24k_magic_10_17 style names)
  'profile_optimization', // cover photos, about section updates (static brand assets)
  'song_request',         // posts driving fans to /request
];

// ── Normalization (2026 standard: lowercase + underscore) ────────────────────
function normalize(str) {
  return String(str).trim().toLowerCase().replace(/\s+/g, '_');
}

function normalizeParams(params) {
  const out = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      out[normalize(k)] = normalize(v);
    }
  }
  return out;
}

// ── URL Builder ──────────────────────────────────────────────────────────────
function buildUTM(baseUrl, params) {
  const normalized = normalizeParams(params);
  const url = new URL(baseUrl);

  // Canonicalize hostname: strip www. to prevent GA4 hostname fragmentation.
  // ultraphonicsmusic.com and www.ultraphonicsmusic.com are treated as
  // different hostnames in GA4's page_location dimension.
  if (url.hostname.startsWith('www.')) {
    url.hostname = url.hostname.slice(4);
  }

  // Strip any pre-existing utm_ params to avoid duplicates
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith('utm_')) url.searchParams.delete(key);
  }

  // Append in canonical order only
  for (const key of PARAM_ORDER) {
    if (normalized[key]) url.searchParams.append(key, normalized[key]);
  }

  return url.toString();
}

// ── Validator ────────────────────────────────────────────────────────────────
function validateUTM(urlString) {
  const issues = [];
  let url;

  try {
    url = new URL(urlString);
  } catch {
    return { valid: false, issues: ['Invalid URL format — cannot parse'] };
  }

  const params = Object.fromEntries(url.searchParams.entries());

  // Detect www. prefix — causes hostname fragmentation in GA4
  if (url.hostname.startsWith('www.')) {
    issues.push(`www. prefix detected on hostname "${url.hostname}" → GA4 will log a different hostname than non-www links. Use "${url.hostname.slice(4)}" instead.`);
  }

  for (const req of REQUIRED) {
    if (!params[req]) issues.push(`Missing required parameter: ${req}`);
  }

  for (const [key, val] of Object.entries(params)) {
    if (!key.startsWith('utm_')) continue;
    const expected = normalize(val);
    if (val !== expected) {
      issues.push(`Non-normalized "${key}": "${val}" → should be "${expected}"`);
    }
  }

  // Verify canonical order for params that are present
  const expectedOrder = PARAM_ORDER.filter(p => params[p]);
  const actualOrder   = [...url.searchParams.keys()].filter(k => PARAM_ORDER.includes(k));
  for (let i = 0; i < expectedOrder.length; i++) {
    if (actualOrder[i] !== expectedOrder[i]) {
      issues.push(`Wrong parameter order. Expected: [${expectedOrder.join(', ')}]. Got: [${actualOrder.join(', ')}]`);
      break;
    }
  }

  return { valid: issues.length === 0, issues, params };
}

// ── Redirect follower (no external deps) ─────────────────────────────────────
function followRedirects(urlString, maxRedirects = 10) {
  return new Promise((resolve, reject) => {
    const chain = [];

    function request(current, remaining) {
      if (remaining <= 0) return reject(new Error(`Too many redirects (max ${maxRedirects})`));

      let url;
      try { url = new URL(current); } catch { return reject(new Error(`Invalid URL: ${current}`)); }

      const mod = url.protocol === 'https:' ? https : http;
      const req = mod.get(
        current,
        { headers: { 'User-Agent': 'UTMArchitect/1.0 (Ultraphonics audit)' }, timeout: 12000 },
        (res) => {
          chain.push({ url: current, status: res.statusCode });
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
            const next = new URL(res.headers.location, current).toString();
            res.resume();
            request(next, remaining - 1);
          } else {
            res.resume();
            resolve({ finalUrl: current, status: res.statusCode, chain });
          }
        }
      );
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out after 12s')); });
    }

    request(urlString, maxRedirects);
  });
}

// ── Redirect + UTM end-to-end check ─────────────────────────────────────────
async function checkLink(shortUrl) {
  let redirectResult;
  try {
    redirectResult = await followRedirects(shortUrl);
  } catch (err) {
    return { shortUrl, ok: false, error: err.message };
  }

  const { finalUrl, status, chain } = redirectResult;
  const validation = validateUTM(finalUrl);

  return {
    shortUrl,
    finalUrl,
    status,
    redirects: chain.length - 1,
    utmsPresent: validation.valid,
    issues: validation.issues,
    params: validation.params,
    ok: status === 200 && validation.valid,
  };
}

// ── Print helpers ─────────────────────────────────────────────────────────────
const C = { green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m', dim: '\x1b[2m', reset: '\x1b[0m', bold: '\x1b[1m' };
const green  = s => `${C.green}${s}${C.reset}`;
const red    = s => `${C.red}${s}${C.reset}`;
const yellow = s => `${C.yellow}${s}${C.reset}`;
const cyan   = s => `${C.cyan}${s}${C.reset}`;
const dim    = s => `${C.dim}${s}${C.reset}`;
const bold   = s => `${C.bold}${s}${C.reset}`;

function printCheckResult(r, label) {
  const prefix = label ? `[${label}] ` : '';
  if (r.error) {
    console.log(`${red('✗')} ${prefix}${r.shortUrl}`);
    console.log(`  ${red('ERROR:')} ${r.error}`);
    return;
  }
  const icon = r.ok ? green('✓') : red('✗');
  console.log(`${icon} ${prefix}${r.shortUrl}`);
  console.log(`  ${dim('→')} ${r.finalUrl}`);
  console.log(`  Status: ${r.status === 200 ? green(r.status) : red(r.status)}  |  Redirects: ${r.redirects}  |  UTMs: ${r.utmsPresent ? green('OK') : red('MISSING/BROKEN')}`);
  if (r.params?.utm_source)   console.log(`  ${dim('source:')}   ${r.params.utm_source}`);
  if (r.params?.utm_medium)   console.log(`  ${dim('medium:')}   ${r.params.utm_medium}`);
  if (r.params?.utm_campaign) console.log(`  ${dim('campaign:')} ${r.params.utm_campaign}`);
  if (r.params?.utm_content)  console.log(`  ${dim('content:')}  ${r.params.utm_content}`);
  if (r.issues?.length) {
    for (const issue of r.issues) console.log(`  ${yellow('⚠')} ${issue}`);
  }
}

// ── GA4 configuration guide ───────────────────────────────────────────────────
function printGA4Config() {
  console.log(`
${bold('═══════════════════════════════════════════════════════════════')}
${bold('  GA4 Configuration Guide — Ultraphonics Campaign Monitoring')}
${bold('═══════════════════════════════════════════════════════════════')}

${bold(cyan('1. CUSTOM CHANNEL GROUP — "Offline Marketing"'))}
${dim('   Admin → Data Display → Channel Groups → Create New Group')}

   Channel Name: ${cyan('Offline Marketing')}
   Conditions (match ANY):
     ┌─────────────────────────────────────────────────────────┐
     │  Session medium  EXACTLY MATCHES  offline               │
     │  OR                                                     │
     │  Session source  EXACTLY MATCHES  qr_code               │
     └─────────────────────────────────────────────────────────┘

   Why: Moves QR code scans out of "Direct" into their own bucket.
   Where to verify: Reports → Acquisition → Traffic Acquisition
                    Look for "Offline Marketing" in the Channel column.

${bold(cyan('2. CAMPAIGN HEALTH — PATH EXPLORATION'))}
${dim('   Explore → Create → Path Exploration')}

   Step 1 — Starting point:
     Node type: ${cyan('Event name')}
     Value:     ${cyan('session_start')}

   Step 2 — Add a Segment filter:
     Segment type:  ${cyan('Session')}
     Condition:     ${cyan('Session campaign')} contains any of:
       • gig_banner
       • koozie
       • weddings_flyer
       • business_card

   Step 3 — Expand the next node:
     Drag ${cyan('Page path')} as the next step dimension.

   What to look for:
     • Where do users go after landing? (Home, Request, Media Kit)
     • Where do they drop off? (dead ends = page needs a CTA)
     • High "exit" % on landing = mismatched expectation from the QR destination.

${bold(cyan('3. UTM CAMPAIGN SEGMENT — for any existing report'))}
${dim('   Works in any standard report. Add as a secondary dimension or filter.')}

   Report filter:
     Dimension:  ${cyan('Session campaign')}
     Condition:  ${cyan('contains')} → ${cyan('gig_banner,koozie,weddings_flyer')}  (comma-separated)

   Recommended report: Engagement → Pages and screens
   Add secondary dimension: ${cyan('Session source / medium')}

${bold(cyan('4. CONVERSION EVENT — "song_request_submit"'))}
${dim('   Admin → Data Display → Events → Mark as Conversion')}

   Find event: ${cyan('song_request_submit')}
   Toggle: ${cyan('Mark as conversion')}

   This creates a "Conversions" metric in your campaign reports so you
   can see how many scans actually resulted in a song request.

${bold(cyan('5. EXPLORE — CAMPAIGN FUNNEL (Optional)'))}
${dim('   Explore → Create → Funnel Exploration')}

   Steps:
     1. ${cyan('session_start')}                (filter: session_medium = offline)
     2. ${cyan('page_view')}   page_location contains /request
     3. ${cyan('song_request_submit')}

   This shows: scan → visited request page → submitted request
   Funnel dropout at step 2 = QR not pointing to /request
   Funnel dropout at step 3 = UX issue on the request page

${bold(cyan('6. CAMPAIGN NAMING TAXONOMY (for future links)'))}

   ${bold('Offline')} (source=qr_code, medium=offline)
     utm_campaign = the physical item the QR is printed on
     utm_content  = optional: version, date, or venue
     ┌────────────────────────────────────────────────────┐
     │  gig_banner      business_card                    │
     │  koozie          weddings_flyer                   │
     │  table_card      flyer                            │
     └────────────────────────────────────────────────────┘

   ${bold('Social')} (source=facebook|youtube|instagram, medium=social)
     utm_campaign = the marketing OBJECTIVE (never a song name or date)
     utm_content  = the specific creative (song, post type, date)
     ┌────────────────────────────────────────────────────┐
     │  fan_engagement    → general audience posts        │
     │  wedding_booking   → posts driving to /quote       │
     │  youtube_content   → video posts (any song)        │
     │  profile_optim…    → cover photos, static assets   │
     │  song_request      → posts driving to /request     │
     └────────────────────────────────────────────────────┘

   ${yellow('⚠ Anti-patterns to avoid:')}
     ${red('✗')} utm_campaign=24k_magic_10_17    (song + date in campaign)
     ${red('✗')} utm_campaign=book_us_for_your…  (sentence as campaign name)
     ${red('✗')} utm_campaign=weddings           (too vague, conflicts with weddings_flyer)
     ${green('✓')} utm_campaign=youtube_content&utm_content=24k_magic
     ${green('✓')} utm_campaign=wedding_booking&utm_content=cta_post_june

${bold('═══════════════════════════════════════════════════════════════')}
`);
}

// ── CLI ───────────────────────────────────────────────────────────────────────
const [,, cmd, ...rest] = process.argv;

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && args[i + 1] && !args[i + 1].startsWith('--')) {
      flags[args[i].slice(2)] = args[i + 1];
      i++;
    } else if (args[i].startsWith('--')) {
      flags[args[i].slice(2)] = true;
    }
  }
  return flags;
}

async function main() {
  if (!cmd || cmd === 'help') {
    console.log(`
${bold('UTM Architect')} — Ultraphonics Campaign URL Tool

${bold('Commands:')}
  ${cyan('build')}      Build a tagged URL (normalizes automatically)
               --url <base>       Base URL  [default: ${BASE_URL}]
               --preset <name>    offline | facebook | youtube | instagram
               --source <s>       utm_source (overrides preset)
               --medium <m>       utm_medium (overrides preset)
               --campaign <c>     utm_campaign ${bold('(required)')}
               --content <c>      utm_content (optional)
               --term <t>         utm_term (optional)

  ${cyan('validate')}   Check a URL for UTM compliance
               validate "<url>"

  ${cyan('check')}      Ping a short link, follow redirects, verify UTMs survive
               check <short-url>

  ${cyan('check-all')} Ping all links in scripts/utm-links.json

  ${cyan('presets')}    Show established UTM patterns for this project

  ${cyan('ga4-config')} Print GA4 setup instructions (channel groups, path exploration)

${bold('Examples:')}
  node scripts/utm-architect.mjs build --preset offline --campaign gig_banner
  node scripts/utm-architect.mjs build --preset facebook --campaign gig_post --content june_12_show
  node scripts/utm-architect.mjs build --url https://ultraphonicsmusic.com/request --preset offline --campaign koozie
  node scripts/utm-architect.mjs validate "https://ultraphonicsmusic.com?utm_source=qr_code&utm_medium=Offline&utm_campaign=gig banner"
  node scripts/utm-architect.mjs check https://tiny.cc/up-request
  node scripts/utm-architect.mjs check-all
`);
    return;
  }

  if (cmd === 'presets') {
    console.log(`\n${bold('Established UTM patterns:')}\n`);
    for (const [name, p] of Object.entries(PRESETS)) {
      console.log(`  ${cyan(name)}`);
      for (const [k, v] of Object.entries(p)) console.log(`    ${k}: ${v}`);
    }
    console.log(`\n  ${dim('Offline campaigns:')} ${KNOWN_OFFLINE_CAMPAIGNS.join(' | ')}`);
    console.log(`  ${dim('Social campaigns:')}  ${KNOWN_SOCIAL_CAMPAIGNS.join(' | ')}\n`);
    return;
  }

  if (cmd === 'ga4-config') {
    printGA4Config();
    return;
  }

  if (cmd === 'build') {
    const flags   = parseFlags(rest);
    const base    = flags.url || BASE_URL;
    const preset  = flags.preset ? PRESETS[flags.preset] : {};

    if (flags.preset && !PRESETS[flags.preset]) {
      console.error(`Unknown preset "${flags.preset}". Valid: ${Object.keys(PRESETS).join(', ')}`);
      process.exit(1);
    }

    const params = {
      utm_source:   flags.source   || preset?.utm_source,
      utm_medium:   flags.medium   || preset?.utm_medium,
      utm_campaign: flags.campaign,
      utm_content:  flags.content,
      utm_term:     flags.term,
    };

    const missing = REQUIRED.filter(r => !params[r]);
    if (missing.length) {
      console.error(`Missing required: ${missing.join(', ')}. Use --campaign, or --preset to fill source/medium.`);
      process.exit(1);
    }

    const tagged     = buildUTM(base, params);
    const validation = validateUTM(tagged);

    console.log(`\n${bold('Tagged URL:')}`);
    console.log(green(tagged));

    if (!validation.valid) {
      console.log(`\n${yellow('Warnings:')} (should not happen — file a bug if you see this)`);
      for (const i of validation.issues) console.log(`  ${yellow('⚠')} ${i}`);
    } else {
      console.log(`\n${green('✓ All parameters normalized and valid.')}`);
    }

    console.log(`\n${bold('Next steps:')}`);
    console.log(`  1. Paste the ${bold('full tagged URL')} above into ${cyan('tiny.cc')} as the destination.`);
    console.log(`  2. ${bold('Do NOT')} add UTM params to the short link itself — tiny.cc will strip them.`);
    console.log(`  3. Run ${cyan(`node scripts/utm-architect.mjs check <your-tiny.cc-link>`)} to verify after shortening.\n`);
    return;
  }

  if (cmd === 'validate') {
    const url = rest[0];
    if (!url) { console.error('Provide a URL: validate "<url>"'); process.exit(1); }

    const result = validateUTM(url);
    console.log(`\n${result.valid ? green('✓ Valid') : red('✗ Invalid')}: ${url}\n`);

    if (Object.keys(result.params || {}).length) {
      console.log('Parameters detected:');
      for (const key of PARAM_ORDER) {
        if (result.params[key]) console.log(`  ${dim(key + ':')} ${result.params[key]}`);
      }
    }
    if (result.issues.length) {
      console.log(`\n${yellow('Issues:')}`);
      for (const i of result.issues) console.log(`  ${yellow('⚠')} ${i}`);
    }
    console.log();
    process.exit(result.valid ? 0 : 1);
  }

  if (cmd === 'check') {
    const url = rest[0];
    if (!url) { console.error('Provide a URL: check <short-url>'); process.exit(1); }

    console.log(`\nFollowing redirect chain for: ${cyan(url)}\n`);
    const result = await checkLink(url);
    printCheckResult(result);
    console.log();
    process.exit(result.ok ? 0 : 1);
  }

  if (cmd === 'check-all') {
    const linksFile = path.join(__dirname, 'utm-links.json');
    if (!fs.existsSync(linksFile)) {
      console.error(`utm-links.json not found at ${linksFile}`);
      console.error('Create it using utm-links.json.example in this directory.');
      process.exit(1);
    }

    const { links } = JSON.parse(fs.readFileSync(linksFile, 'utf8'));
    const trackable = links.filter(l => l.status !== 'skip');
    const skipped   = links.filter(l => l.status === 'skip');

    if (skipped.length) {
      for (const s of skipped) {
        console.log(`${dim('–')} [${s.name}] ${dim('skipped')} ${dim('(' + (s._note || 'non-GA4 destination') + ')')}`);
      }
      console.log();
    }

    console.log(`Auditing ${bold(trackable.length)} trackable link(s)...\n`);

    let passed = 0, failed = 0;
    for (const link of trackable) {
      const result = await checkLink(link.url);
      if (link.status === 'needs_rebuild') {
        // Flag known-bad links as warnings rather than errors
        console.log(`${yellow('⚑')} [${link.name}] ${yellow('needs_rebuild')} — ${dim(link._note || '')}`);
        console.log(`  ${dim('Checking redirect anyway...')}`);
      }
      printCheckResult(result, link.name || null);
      result.ok ? passed++ : failed++;
      console.log();
    }

    const summary = `── ${passed} passed, ${failed} failed ──`;
    console.log(failed > 0 ? red(summary) : green(summary));
    console.log();
    process.exit(failed > 0 ? 1 : 0);
  }

  console.error(`Unknown command: "${cmd}". Run without arguments for help.`);
  process.exit(1);
}

main().catch(e => { console.error(red(e.message)); process.exit(1); });

export { buildUTM, validateUTM, checkLink, normalize, normalizeParams, PRESETS, PARAM_ORDER };
