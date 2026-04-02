#!/usr/bin/env node
// scripts/enrich.js
// depthfirst — nightly OSS intelligence enrichment pipeline
// Reads COMPANIES list → calls GitHub API → scores buying signals → writes data.json
// Requires GH_PAT env var (Settings > Developer settings > Personal access tokens)
// Scopes needed: read:org, public_repo

import { writeFileSync } from 'fs';

const TOKEN = process.env.GH_PAT;
const BASE  = 'https://api.github.com';
const SLEEP_MS = 300; // between companies — stays well inside 5k req/hr free tier

if (!TOKEN) {
  console.error('Error: GH_PAT env var is not set.');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Company universe — add rows here to expand beyond F500
// ─────────────────────────────────────────────────────────────────────────────
GET /search/users?q=type:org+repos:>50+followers:>200&sort=followers
const COMPANIES = [
  // Technology
  { rank: 14,  name: 'Microsoft',           sector: 'Technology', org: 'microsoft'          },
  { rank: 2,   name: 'Amazon / AWS',         sector: 'Technology', org: 'aws'                },
  { rank: 8,   name: 'Alphabet (Google)',    sector: 'Technology', org: 'google'             },
  { rank: 27,  name: 'Meta Platforms',       sector: 'Technology', org: 'facebook'           },
  { rank: 49,  name: 'IBM',                  sector: 'Technology', org: 'IBM'                },
  { rank: 46,  name: 'Intel',                sector: 'Technology', org: 'intel'              },
  { rank: 77,  name: 'Cisco Systems',        sector: 'Technology', org: 'cisco'              },
  { rank: 136, name: 'Salesforce',           sector: 'Technology', org: 'salesforce'         },
  { rank: 85,  name: 'Oracle',               sector: 'Technology', org: 'oracle'             },
  { rank: 134, name: 'Nvidia',               sector: 'Technology', org: 'NVIDIA'             },
  { rank: 3,   name: 'Apple',                sector: 'Technology', org: 'apple'              },
  { rank: 31,  name: 'Dell Technologies',    sector: 'Technology', org: 'dell'               },
  { rank: 128, name: 'Broadcom',             sector: 'Technology', org: 'broadcom'           },
  { rank: null,name: 'NetApp',               sector: 'Technology', org: 'NetApp'             },
  { rank: 127, name: 'Micron Technology',    sector: 'Technology', org: 'MicronOpenSource'   },
  { rank: null,name: 'HP Inc',               sector: 'Technology', org: 'hp-inc'             },
  { rank: null,name: 'Western Digital',      sector: 'Technology', org: 'westerndigitalcorp' },
  { rank: null,name: 'Qualcomm',             sector: 'Technology', org: 'qualcomm'           },
  // Telecom
  { rank: 13,  name: 'AT&T',                 sector: 'Telecom',    org: 'att'                },
  { rank: null,name: 'T-Mobile',             sector: 'Telecom',    org: 'tmobile'            },
  { rank: 23,  name: 'Verizon',              sector: 'Telecom',    org: 'Verizon'            },
  { rank: 28,  name: 'Comcast',              sector: 'Telecom',    org: 'Comcast'            },
  { rank: null,name: 'Charter Communications', sector: 'Telecom', org: 'chartertech'         },
  // Financial
  { rank: 24,  name: 'JPMorgan Chase',       sector: 'Financial',  org: 'jpmorganchase'      },
  { rank: 57,  name: 'Goldman Sachs',        sector: 'Financial',  org: 'goldmansachs'       },
  { rank: null,name: 'Capital One',          sector: 'Financial',  org: 'capitalone'         },
  { rank: null,name: 'American Express',     sector: 'Financial',  org: 'americanexpress'    },
  { rank: 143, name: 'PayPal Holdings',      sector: 'Financial',  org: 'paypal'             },
  { rank: null,name: 'Mastercard',           sector: 'Financial',  org: 'Mastercard'         },
  { rank: null,name: 'Morgan Stanley',       sector: 'Financial',  org: 'morganstanley'      },
  { rank: 147, name: 'Visa',                 sector: 'Financial',  org: 'visa'               },
  { rank: 41,  name: 'Wells Fargo',          sector: 'Financial',  org: 'wellsfargo'         },
  { rank: 44,  name: 'Citigroup',            sector: 'Financial',  org: 'citi'               },
  { rank: null,name: 'Fidelity Investments', sector: 'Financial',  org: 'fidelity-investments'},
  { rank: null,name: 'BlackRock',            sector: 'Financial',  org: 'blackrock'          },
  { rank: 36,  name: 'Bank of America',      sector: 'Financial',  org: 'bankofamerica'      },
  // Retail
  { rank: 1,   name: 'Walmart',              sector: 'Retail',     org: 'walmartlabs'        },
  { rank: 32,  name: 'Target',               sector: 'Retail',     org: 'target'             },
  { rank: 17,  name: 'Home Depot',           sector: 'Retail',     org: 'homedepotinc'       },
  { rank: 21,  name: 'Kroger',               sector: 'Retail',     org: 'KrogerTechnology'   },
  { rank: 35,  name: "Lowe's",               sector: 'Retail',     org: 'LowesDigital'       },
  { rank: null,name: 'Nike',                 sector: 'Retail',     org: 'nike'               },
  { rank: null,name: 'Best Buy',             sector: 'Retail',     org: 'bestbuy'            },
  { rank: 11,  name: 'Costco Wholesale',     sector: 'Retail',     org: 'costco'             },
  // Media
  { rank: 73,  name: 'Netflix',              sector: 'Media',      org: 'Netflix'            },
  { rank: 53,  name: 'Walt Disney',          sector: 'Media',      org: 'wdpro'              },
  { rank: null,name: 'Warner Bros Discovery', sector: 'Media',     org: 'warnerbros'         },
  // Healthcare
  { rank: 37,  name: 'Johnson & Johnson',    sector: 'Healthcare', org: 'janssen'            },
  { rank: 173, name: 'Becton Dickinson',     sector: 'Healthcare', org: 'bectondickinson'    },
  { rank: null,name: 'Change Healthcare',    sector: 'Healthcare', org: 'changehealthcare'   },
  { rank: 4,   name: 'CVS Health',           sector: 'Healthcare', org: 'CVSHealth'          },
  { rank: 5,   name: 'UnitedHealth Group',   sector: 'Healthcare', org: 'uhc'               },
  { rank: 43,  name: 'Pfizer',               sector: 'Healthcare', org: 'pfizer'             },
  { rank: 40,  name: 'Humana',               sector: 'Healthcare', org: 'Humana'             },
  // Defense
  { rank: 55,  name: 'Lockheed Martin',      sector: 'Defense',    org: 'lockheedmartin'     },
  { rank: null,name: 'Boeing',               sector: 'Defense',    org: 'Boeing'             },
  { rank: null,name: 'Booz Allen Hamilton',  sector: 'Defense',    org: 'boozallen'          },
  { rank: 58,  name: 'Raytheon Technologies', sector: 'Defense',   org: 'raytheoncompany'    },
  { rank: null,name: 'Northrop Grumman',     sector: 'Defense',    org: 'northropgrumman'    },
  { rank: null,name: 'Leidos',               sector: 'Defense',    org: 'Leidos'             },
  { rank: null,name: 'SAIC',                 sector: 'Defense',    org: 'saic-it'            },
  // Automotive
  { rank: 22,  name: 'Ford Motor',           sector: 'Automotive', org: 'ford-motor-company' },
  { rank: 25,  name: 'General Motors',       sector: 'Automotive', org: 'GeneralMotors'      },
  { rank: null,name: 'Tesla',                sector: 'Automotive', org: 'tesla'              },
  { rank: null,name: 'Stellantis',           sector: 'Automotive', org: 'stellantis'         },
  // Energy
  { rank: 6,   name: 'ExxonMobil',           sector: 'Energy',     org: 'ExxonMobil'         },
  { rank: 16,  name: 'Chevron',              sector: 'Energy',     org: 'chevron'            },
  { rank: null,name: 'Duke Energy',          sector: 'Energy',     org: 'duke-energy'        },
  { rank: null,name: 'ConocoPhillips',       sector: 'Energy',     org: 'conocophillips'     },
  { rank: null,name: 'NextEra Energy',       sector: 'Energy',     org: 'nextera'            },
];

// ─────────────────────────────────────────────────────────────────────────────
// Buying signal weights — tune these as you learn from outreach results
// ─────────────────────────────────────────────────────────────────────────────
const WEIGHTS = {
  highRiskLang:     20,   // JS/TS/Python/Java/Go/Ruby = high CVE surface
  recentCommit:     15,   // last push < 30 days = live attack surface
  largeTeam:        10,   // >20 contributors = hard to manually audit
  hasActions:       10,   // GitHub Actions CI/CD = integration-ready
  noSecurityMd:     10,   // no SECURITY.md = AppSec gap
  hasDependabot:     8,   // aware of problem, comparison shopping
  hasDepFiles:       8,   // package.json/requirements.txt = dep surface
  openSecIssues:    10,   // proven pain, active backlog
  highStars:         5,   // top repo >1k stars = blast radius
  oldOrg:            4,   // org age >3yrs = code debt
};

const HIGH_RISK_LANGS = new Set([
  'JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Ruby', 'PHP', 'Kotlin', 'Scala'
]);

// ─────────────────────────────────────────────────────────────────────────────
// GitHub API helpers
// ─────────────────────────────────────────────────────────────────────────────
async function gh(path, retries = 3) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Authorization':        `Bearer ${TOKEN}`,
      'Accept':               'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (res.status === 404) return null;

  if (res.status === 403 || res.status === 429) {
    const reset = Number(res.headers.get('x-ratelimit-reset') || 0);
    const wait  = Math.max((reset * 1000 - Date.now()) + 1000, 5000);
    console.warn(`  Rate limited — waiting ${Math.ceil(wait / 1000)}s`);
    await sleep(wait);
    return retries > 0 ? gh(path, retries - 1) : null;
  }

  if (!res.ok) {
    console.warn(`  HTTP ${res.status} for ${path}`);
    return null;
  }

  return res.json();
}

async function fileExists(org, repo, path) {
  const res = await fetch(`${BASE}/repos/${org}/${repo}/contents/${path}`, {
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Accept':        'application/vnd.github+json',
    },
  });
  return res.status === 200;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// Score engine
// ─────────────────────────────────────────────────────────────────────────────
function calcScore(d) {
  let s = 0;
  if (d.primary_language && HIGH_RISK_LANGS.has(d.primary_language)) s += WEIGHTS.highRiskLang;
  if (d.last_push_days !== null && d.last_push_days < 30)            s += WEIGHTS.recentCommit;
  if (d.contributors > 20)                                            s += WEIGHTS.largeTeam;
  if (d.has_actions)                                                  s += WEIGHTS.hasActions;
  if (!d.has_security_md)                                             s += WEIGHTS.noSecurityMd;
  if (d.has_dependabot)                                               s += WEIGHTS.hasDependabot;
  if (d.has_dep_files)                                                s += WEIGHTS.hasDepFiles;
  if (d.open_security_issues > 0)                                     s += WEIGHTS.openSecIssues;
  if (d.top_repo_stars > 1000)                                        s += WEIGHTS.highStars;
  if (d.org_age_years > 3)                                            s += WEIGHTS.oldOrg;
  return Math.min(100, s);
}

// ─────────────────────────────────────────────────────────────────────────────
// Enrich a single company
// ─────────────────────────────────────────────────────────────────────────────
async function enrichCompany(company) {
  process.stdout.write(`  ${company.name.padEnd(30)}`);

  try {
    // 1. Org metadata
    const orgData = await gh(`/orgs/${company.org}`);
    if (!orgData) {
      console.log('skipped — org not found');
      return { ...baseShape(company), enriched: false };
    }

    // 2. Recent public repos (sorted by last push)
    const repos = await gh(`/orgs/${company.org}/repos?sort=pushed&per_page=50&type=public`);
    if (!repos?.length) {
      console.log('skipped — no public repos');
      return { ...baseShape(company), enriched: false };
    }

    // 3. Top repo by stars (for file checks)
    const byStars   = [...repos].sort((a, b) => b.stargazers_count - a.stargazers_count);
    const topRepo   = byStars[0];
    const recentRepo = repos[0]; // most recently pushed

    // 4. Language aggregation across top 15 repos
    const langCounts = {};
    for (const r of byStars.slice(0, 15)) {
      if (r.language) langCounts[r.language] = (langCounts[r.language] || 0) + 1;
    }
    const languages    = Object.entries(langCounts).sort((a, b) => b[1] - a[1]).map(([l]) => l);
    const primaryLang  = languages[0] ?? null;

    // 5. Last push age
    const lastPushDays = recentRepo?.pushed_at
      ? Math.floor((Date.now() - new Date(recentRepo.pushed_at).getTime()) / 86_400_000)
      : null;

    // 6. Contributor count (top starred repo, capped at 100)
    const contribData   = await gh(`/repos/${company.org}/${topRepo.name}/contributors?per_page=100&anon=false`);
    const contributors  = Array.isArray(contribData) ? contribData.length : 0;

    // 7. Parallel file existence checks on top repo
    const [hasActions, hasSecMd, hasDependabot, hasPkg, hasReqs, hasGoMod, hasPom] =
      await Promise.all([
        fileExists(company.org, topRepo.name, '.github/workflows'),
        fileExists(company.org, topRepo.name, 'SECURITY.md'),
        fileExists(company.org, topRepo.name, '.github/dependabot.yml'),
        fileExists(company.org, topRepo.name, 'package.json'),
        fileExists(company.org, topRepo.name, 'requirements.txt'),
        fileExists(company.org, topRepo.name, 'go.mod'),
        fileExists(company.org, topRepo.name, 'pom.xml'),
      ]);
    const hasDepFiles = hasPkg || hasReqs || hasGoMod || hasPom;

    // 8. Open security-labeled issues
    const secIssues         = await gh(`/repos/${company.org}/${topRepo.name}/issues?labels=security&state=open&per_page=10`);
    const openSecIssues     = Array.isArray(secIssues) ? secIssues.length : 0;

    // 9. Org age
    const orgAgeYears = orgData.created_at
      ? (Date.now() - new Date(orgData.created_at).getTime()) / (365.25 * 86_400_000)
      : 0;

    const enriched = {
      ...baseShape(company),
      enriched:             true,
      enriched_at:          new Date().toISOString(),
      repos:                orgData.public_repos ?? repos.length,
      languages,
      primary_language:     primaryLang,
      last_push_days:       lastPushDays,
      contributors,
      top_repo_name:        topRepo.name,
      top_repo_stars:       topRepo.stargazers_count ?? 0,
      has_actions:          hasActions,
      has_security_md:      hasSecMd,
      has_dependabot:       hasDependabot,
      has_dep_files:        hasDepFiles,
      open_security_issues: openSecIssues,
      org_age_years:        Math.floor(orgAgeYears),
    };

    enriched.score    = calcScore(enriched);
    enriched.tier     = enriched.score >= 70 ? 1 : enriched.score >= 40 ? 2 : 3;
    enriched.activity = enriched.score >= 70 ? 'High' : enriched.score >= 40 ? 'Medium' : 'Low';

    console.log(`score=${String(enriched.score).padStart(3)}  lang=${String(primaryLang ?? '—').padEnd(12)}  push=${String(lastPushDays ?? '?') + 'd ago'}`);

    await sleep(SLEEP_MS);
    return enriched;

  } catch (err) {
    console.log(`error — ${err.message}`);
    return { ...baseShape(company), enriched: false };
  }
}

function baseShape(c) {
  return {
    rank:                 c.rank,
    name:                 c.name,
    sector:               c.sector,
    org:                  c.org,
    repos:                0,
    activity:             'Low',
    tier:                 3,
    score:                0,
    enriched:             false,
    enriched_at:          null,
    languages:            [],
    primary_language:     null,
    last_push_days:       null,
    contributors:         0,
    top_repo_name:        null,
    top_repo_stars:       0,
    has_actions:          false,
    has_security_md:      false,
    has_dependabot:       false,
    has_dep_files:        false,
    open_security_issues: 0,
    org_age_years:        0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('depthfirst OSS enrichment pipeline');
  console.log(`Companies: ${COMPANIES.length} | ${new Date().toISOString()}\n`);

  // Rate limit check
  const rl = await gh('/rate_limit');
  if (rl) console.log(`GitHub API: ${rl.rate.remaining}/${rl.rate.limit} remaining (resets ${new Date(rl.rate.reset * 1000).toISOString()})\n`);

  const results = [];
  for (const company of COMPANIES) {
    const enriched = await enrichCompany(company);
    results.push(enriched);
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  writeFileSync('data.json', JSON.stringify(results, null, 2));

  const ok   = results.filter(r => r.enriched).length;
  const fail = results.filter(r => !r.enriched).length;
  const avg  = Math.round(results.filter(r => r.enriched).reduce((s, r) => s + r.score, 0) / ok);
  const t1   = results.filter(r => r.tier === 1).length;

  console.log(`\n─────────────────────────────`);
  console.log(`Enriched: ${ok}  Failed: ${fail}`);
  console.log(`Avg score: ${avg}  Tier 1: ${t1}`);
  console.log(`Wrote data.json`);
}

main().catch(err => { console.error(err); process.exit(1); });
