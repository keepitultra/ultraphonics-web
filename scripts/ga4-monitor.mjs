#!/usr/bin/env node
/**
 * GA4 Campaign Monitor — Ultraphonics
 *
 * Queries the GA4 Data API and:
 *   1. Checks daily session counts — alerts if below threshold for 48+ hours
 *   2. Reports campaign-level traffic breakdown
 *   3. Outputs JSON report + fires optional webhook
 *
 * Setup:
 *   1. Enable "Google Analytics Data API" in Google Cloud Console for your project
 *   2. Grant your service account "Viewer" access in GA4 Admin → Account Access Management
 *   3. Run: node scripts/ga4-monitor.mjs
 *
 * Environment variables (optional):
 *   GA4_PROPERTY_ID    Override property ID  (default: 494449748)
 *   GA4_THRESHOLD      Sessions/day floor    (default: 5)
 *   GA4_ALERT_DAYS     Consecutive days to trigger alert (default: 2)
 *   GA4_ALERT_WEBHOOK  Slack/webhook URL to POST alert payload to
 *   GA4_SERVICE_ACCOUNT Path to service account JSON (default: scripts/service-account.json)
 *
 * Usage:
 *   node scripts/ga4-monitor.mjs              → full report
 *   node scripts/ga4-monitor.mjs --days 14    → look back 14 days
 *   node scripts/ga4-monitor.mjs --campaigns  → campaign breakdown only
 *   node scripts/ga4-monitor.mjs --sessions   → session health only
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────
const PROPERTY_ID       = process.env.GA4_PROPERTY_ID   || '494449748';
const SESSION_THRESHOLD = parseInt(process.env.GA4_THRESHOLD   || '5',  10);
const ALERT_DAYS        = parseInt(process.env.GA4_ALERT_DAYS  || '2',  10);
const ALERT_WEBHOOK     = process.env.GA4_ALERT_WEBHOOK  || null;
const SA_PATH = process.env.GA4_SERVICE_ACCOUNT
  || path.join(__dirname, 'service-account.json');

// All known campaigns — current live + recommended future taxonomy.
// Add new campaign slugs here as you create them so they appear in the health report.
const TRACKED_CAMPAIGNS = [
  // Offline (QR) — current live
  'gig_banner', 'koozie', 'business_card', 'weddings_flyer',
  // Social — current live (some will be migrated to the new taxonomy below)
  '2026_survey_post', '24k_magic_10_17', 'cover_photo', 'weddings', 'book_us_for_your_next_event',
  // Social — recommended future taxonomy (see utm-architect.mjs ga4-config)
  'fan_engagement', 'wedding_booking', 'youtube_content', 'profile_optimization', 'song_request',
];

// ── Color helpers ─────────────────────────────────────────────────────────────
const C = { green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m', dim: '\x1b[2m', bold: '\x1b[1m', reset: '\x1b[0m' };
const green  = s => `${C.green}${s}${C.reset}`;
const red    = s => `${C.red}${s}${C.reset}`;
const yellow = s => `${C.yellow}${s}${C.reset}`;
const cyan   = s => `${C.cyan}${s}${C.reset}`;
const dim    = s => `${C.dim}${s}${C.reset}`;
const bold   = s => `${C.bold}${s}${C.reset}`;

// ── Auth — service account JWT → access token ─────────────────────────────────
async function getAccessToken(saPath) {
  let sa;
  try {
    sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
  } catch {
    throw new Error(`Cannot read service account: ${saPath}\nGrant it "Viewer" access in GA4 Admin → Account Access Management.`);
  }

  // Try google-auth-library first (available via firebase-admin)
  try {
    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({
      credentials: sa,
      scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    return tokenResponse.token;
  } catch {
    // Fallback: manual RS256 JWT
    return getAccessTokenManual(sa);
  }
}

async function getAccessTokenManual(sa) {
  const { createSign } = await import('node:crypto');

  const now = Math.floor(Date.now() / 1000);
  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).toString('base64url');

  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(sa.private_key, 'base64url');
  const jwt = `${header}.${payload}.${sig}`;

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  }).toString();

  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': body.length } },
      (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          const json = JSON.parse(data);
          if (json.error) reject(new Error(`Auth error: ${json.error_description || json.error}`));
          else resolve(json.access_token);
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── GA4 Data API ──────────────────────────────────────────────────────────────
function ga4Request(token, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request(
      {
        hostname: 'analyticsdata.googleapis.com',
        path: `/v1beta/properties/${PROPERTY_ID}:runReport`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.error) reject(new Error(`GA4 API error ${json.error.code}: ${json.error.message}`));
            else resolve(json);
          } catch {
            reject(new Error(`Failed to parse GA4 response: ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── Report builders ───────────────────────────────────────────────────────────
async function getDailySessions(token, lookbackDays = 7) {
  const report = await ga4Request(token, {
    dimensions: [{ name: 'date' }],
    metrics:    [{ name: 'sessions' }, { name: 'activeUsers' }],
    dateRanges: [{ startDate: `${lookbackDays}daysAgo`, endDate: 'today' }],
    orderBys:   [{ dimension: { dimensionName: 'date' }, desc: false }],
  });

  return (report.rows || []).map(row => ({
    date:        row.dimensionValues[0].value,
    sessions:    parseInt(row.metricValues[0].value, 10),
    activeUsers: parseInt(row.metricValues[1].value, 10),
  }));
}

async function getCampaignBreakdown(token, lookbackDays = 30) {
  const report = await ga4Request(token, {
    dimensions: [
      { name: 'sessionCampaignName' },
      { name: 'sessionSource' },
      { name: 'sessionMedium' },
    ],
    metrics: [
      { name: 'sessions' },
      { name: 'activeUsers' },
      { name: 'eventCount' },
      { name: 'conversions' },
    ],
    dateRanges: [{ startDate: `${lookbackDays}daysAgo`, endDate: 'today' }],
    orderBys:   [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 50,
  });

  return (report.rows || []).map(row => ({
    campaign:    row.dimensionValues[0].value,
    source:      row.dimensionValues[1].value,
    medium:      row.dimensionValues[2].value,
    sessions:    parseInt(row.metricValues[0].value, 10),
    activeUsers: parseInt(row.metricValues[1].value, 10),
    events:      parseInt(row.metricValues[2].value, 10),
    conversions: parseInt(row.metricValues[3].value, 10),
  }));
}

async function getSongRequestConversions(token, lookbackDays = 30) {
  const report = await ga4Request(token, {
    dimensions: [{ name: 'sessionCampaignName' }, { name: 'sessionMedium' }],
    metrics:    [{ name: 'eventCount' }],
    dateRanges: [{ startDate: `${lookbackDays}daysAgo`, endDate: 'today' }],
    dimensionFilter: {
      filter: {
        fieldName: 'eventName',
        stringFilter: { matchType: 'EXACT', value: 'song_request_submit' },
      },
    },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 20,
  });

  return (report.rows || []).map(row => ({
    campaign:      row.dimensionValues[0].value,
    medium:        row.dimensionValues[1].value,
    songRequests:  parseInt(row.metricValues[0].value, 10),
  }));
}

// ── Data gap detector ─────────────────────────────────────────────────────────
function detectDataGaps(dailySessions, threshold = SESSION_THRESHOLD, alertAfterDays = ALERT_DAYS) {
  const gaps = [];
  let streak = [];

  for (const day of dailySessions) {
    if (day.sessions < threshold) {
      streak.push(day);
    } else {
      if (streak.length >= alertAfterDays) gaps.push([...streak]);
      streak = [];
    }
  }
  if (streak.length >= alertAfterDays) gaps.push([...streak]);

  return gaps;
}

// ── Webhook alert ─────────────────────────────────────────────────────────────
async function sendWebhookAlert(webhookUrl, payload) {
  const body = JSON.stringify(payload);
  const url  = new URL(webhookUrl);
  const mod  = url.protocol === 'https:' ? https : (await import('node:http')).default;

  return new Promise((resolve, reject) => {
    const req = mod.request(
      { hostname: url.hostname, path: url.pathname + url.search, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => { res.resume(); resolve(res.statusCode); }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Formatting helpers ────────────────────────────────────────────────────────
function formatDate(yyyymmdd) {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function bar(n, max, width = 20) {
  const filled = max > 0 ? Math.round((n / max) * width) : 0;
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function padEnd(str, len) {
  return String(str).padEnd(len);
}

function padStart(str, len) {
  return String(str).padStart(len);
}

// ── Main ──────────────────────────────────────────────────────────────────────
const args       = process.argv.slice(2);
const flagDays   = args.includes('--days')      ? parseInt(args[args.indexOf('--days') + 1], 10) : null;
const onlyCamp   = args.includes('--campaigns');
const onlySess   = args.includes('--sessions');
const lookback   = flagDays || 14;

async function main() {
  console.log(`\n${bold('GA4 Campaign Monitor')} ${dim(`— Property ${PROPERTY_ID}`)}\n`);

  let token;
  try {
    process.stdout.write('Authenticating with service account... ');
    token = await getAccessToken(SA_PATH);
    console.log(green('✓'));
  } catch (err) {
    console.log(red('✗'));
    console.error(`\n${red('Auth failed:')} ${err.message}\n`);
    console.error(`Make sure ${SA_PATH} exists and has GA4 Viewer access.`);
    process.exit(1);
  }

  const results = { generatedAt: new Date().toISOString(), propertyId: PROPERTY_ID, alerts: [] };

  // ── Session health ──────────────────────────────────────────────────────────
  if (!onlyCamp) {
    process.stdout.write(`Fetching daily sessions (last ${lookback} days)... `);
    const dailySessions = await getDailySessions(token, lookback);
    console.log(green('✓'));

    const maxSessions = Math.max(...dailySessions.map(d => d.sessions), 1);
    const gaps        = detectDataGaps(dailySessions);

    console.log(`\n${bold('Daily Sessions')}  ${dim(`(threshold: ${SESSION_THRESHOLD}/day, alert after ${ALERT_DAYS} days)`)}`);
    console.log(dim('─'.repeat(58)));

    for (const day of dailySessions) {
      const low  = day.sessions < SESSION_THRESHOLD;
      const cnt  = padStart(day.sessions, 4);
      const b    = bar(day.sessions, maxSessions, 18);
      const flag = low ? red(' ⚠ LOW') : '';
      console.log(`  ${formatDate(day.date)}  ${low ? red(cnt) : green(cnt)}  ${dim(b)}${flag}`);
    }

    if (gaps.length === 0) {
      console.log(`\n  ${green('✓ No data gaps detected.')}`);
    } else {
      for (const gap of gaps) {
        const startDate = formatDate(gap[0].date);
        const endDate   = formatDate(gap[gap.length - 1].date);
        const msg       = `Data gap: ${gap.length} consecutive day(s) below ${SESSION_THRESHOLD} sessions (${startDate} → ${endDate})`;
        console.log(`\n  ${red('⚠ ALERT:')} ${msg}`);
        results.alerts.push({ type: 'data_gap', message: msg, days: gap });
      }
    }

    results.dailySessions = dailySessions;
    results.dataGaps      = gaps;
  }

  // ── Campaign breakdown ──────────────────────────────────────────────────────
  if (!onlySess) {
    process.stdout.write(`\nFetching campaign breakdown (last ${lookback} days)... `);
    const campaigns = await getCampaignBreakdown(token, lookback);
    console.log(green('✓'));

    const tracked   = campaigns.filter(c => TRACKED_CAMPAIGNS.includes(c.campaign));
    const offline   = campaigns.filter(c => c.medium === 'offline');
    const social    = campaigns.filter(c => c.medium === 'social');
    const otherTop  = campaigns.filter(c => !TRACKED_CAMPAIGNS.includes(c.campaign)).slice(0, 5);

    function printCampaignTable(rows, label) {
      if (!rows.length) { console.log(`  ${dim('(none)')}`); return; }
      const maxS = Math.max(...rows.map(r => r.sessions), 1);
      console.log(`  ${dim(padEnd('Campaign', 22))}  ${dim(padEnd('Source/Medium', 22))}  ${dim(padStart('Sessions', 8))}  ${dim(padStart('Conv.', 5))}`);
      console.log(`  ${dim('─'.repeat(70))}`);
      for (const r of rows) {
        const sm    = `${r.source}/${r.medium}`;
        const conv  = r.conversions > 0 ? cyan(padStart(r.conversions, 5)) : dim(padStart('—', 5));
        const sess  = r.sessions > 0 ? padStart(r.sessions, 8) : dim(padStart('0', 8));
        console.log(`  ${padEnd(r.campaign.slice(0, 21), 22)}  ${dim(padEnd(sm.slice(0, 21), 22))}  ${r.sessions > 0 ? green(sess) : dim(sess)}  ${conv}`);
      }
    }

    console.log(`\n${bold('Tracked Campaigns')}`);
    console.log(dim('─'.repeat(58)));
    printCampaignTable(tracked, 'Tracked');

    if (offline.length) {
      console.log(`\n${bold('All Offline (QR) Traffic')}`);
      console.log(dim('─'.repeat(58)));
      printCampaignTable(offline, 'Offline');
    }

    if (social.length) {
      console.log(`\n${bold('Social Traffic')}`);
      console.log(dim('─'.repeat(58)));
      printCampaignTable(social, 'Social');
    }

    if (otherTop.length) {
      console.log(`\n${bold('Other Top Sources')} ${dim('(not in tracked list)')}`);
      console.log(dim('─'.repeat(58)));
      printCampaignTable(otherTop, 'Other');
    }

    results.campaigns = campaigns;
  }

  // ── Song request conversions ────────────────────────────────────────────────
  if (!onlySess) {
    process.stdout.write('\nFetching song_request_submit by campaign... ');
    const songReqs = await getSongRequestConversions(token, lookback);
    console.log(green('✓'));

    if (songReqs.length) {
      console.log(`\n${bold('Song Request Submissions by Campaign')}`);
      console.log(dim('─'.repeat(58)));
      for (const r of songReqs) {
        const med = r.medium !== '(not set)' ? dim(` via ${r.medium}`) : '';
        console.log(`  ${padEnd(r.campaign.slice(0, 28), 30)}  ${cyan(padStart(r.songRequests, 4))} requests${med}`);
      }
    } else {
      console.log(`\n  ${dim('No song_request_submit events in this period.')}`);
    }
    results.songRequestConversions = songReqs;
  }

  // ── Write report ────────────────────────────────────────────────────────────
  const reportPath = path.join(__dirname, 'ga4-monitor-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n${dim('Report saved:')} ${reportPath}`);

  // ── Webhook alert ───────────────────────────────────────────────────────────
  if (results.alerts.length && ALERT_WEBHOOK) {
    const alertPayload = {
      text: `🚨 *GA4 Data Alert — Ultraphonics*\n${results.alerts.map(a => `• ${a.message}`).join('\n')}`,
      attachments: results.alerts.map(a => ({ color: 'danger', text: a.message })),
    };
    try {
      process.stdout.write('\nSending webhook alert... ');
      await sendWebhookAlert(ALERT_WEBHOOK, alertPayload);
      console.log(green('✓'));
    } catch (err) {
      console.log(yellow(`⚠ Webhook failed: ${err.message}`));
    }
  } else if (results.alerts.length && !ALERT_WEBHOOK) {
    console.log(`\n${yellow('⚠')} ${results.alerts.length} alert(s) detected. Set ${cyan('GA4_ALERT_WEBHOOK')} env var to receive notifications.\n`);
  } else {
    console.log(`\n${green('✓ No alerts. Campaign tracking looks healthy.')}\n`);
  }
}

main().catch(e => {
  console.error(`\n${red('Fatal:')} ${e.message}\n`);
  process.exit(1);
});
