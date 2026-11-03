import { writeFileSync } from "node:fs";

const LOGIN = process.env.GH_LOGIN || "ankits1802";
const TOKEN = process.env.GH_TOKEN;
if (!TOKEN) throw new Error("GH_TOKEN is required");

async function gql(query, variables = {}) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json", "User-Agent": LOGIN },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (body.errors) throw new Error(JSON.stringify(body.errors));
  return body.data;
}

const base = await gql(
  `query($login:String!){ user(login:$login){
   
    contributionsCollection{ contributionYears contributionCalendar{ totalContributions weeks{ contributionDays{ contributionCount date } } } }
    repositoriesContributedTo(first:100, includeUserRepositories:false, contributionTypes:[COMMIT,PULL_REQUEST,REPOSITORY]){
      totalCount nodes{ isPrivate languages(first:10, orderBy:{field:SIZE,direction:DESC}){ edges{ size node{ name color } } } } }
    repositories(first:100, ownerAffiliations:OWNER, isFork:false, privacy:PUBLIC){
      totalCount nodes{ languages(first:10, orderBy:{field:SIZE,direction:DESC}){ edges{ size node{ name color } } } } }
  } }`,
  { login: LOGIN }
);
const u = base.user;

let allTime = 0, commits = 0, prs = 0, reviews = 0;
for (const year of u.contributionsCollection.contributionYears) {
  const d = await gql(
    `query($login:String!,$from:DateTime!,$to:DateTime!){ user(login:$login){ contributionsCollection(from:$from,to:$to){
      contributionCalendar{ totalContributions } totalCommitContributions totalPullRequestContributions totalPullRequestReviewContributions } } }`,
    { login: LOGIN, from: `${year}-01-01T00:00:00Z`, to: `${year}-12-31T23:59:59Z` }
  );
  const c = d.user.contributionsCollection;
  allTime += c.contributionCalendar.totalContributions;
  commits += c.totalCommitContributions;
  prs += c.totalPullRequestContributions;
  reviews += c.totalPullRequestReviewContributions;
}

const langs = new Map();
const repos = [...u.repositories.nodes, ...u.repositoriesContributedTo.nodes.filter((r) => !r.isPrivate)];
for (const r of repos) {
  for (const { size, node } of r.languages.edges) {
    if (["Jupyter Notebook", "HTML", "CSS", "Batchfile", "Procfile", "Dockerfile", "Makefile"].includes(node.name)) continue;
    const cur = langs.get(node.name) || { size: 0, color: node.color || "#94a3b8" };
    cur.size += size;
    langs.set(node.name, cur);
  }
}
const totalSize = [...langs.values()].reduce((a, b) => a + b.size, 0) || 1;
const top = [...langs.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, 6);

const fmt = (n) => n.toLocaleString("en-US");
const metrics = [
  ["Contributions · last year", u.contributionsCollection.contributionCalendar.totalContributions, "#7dd3fc"],
  ["All-time contributions", allTime, "#c4b5fd"],
  ["Commits", commits, "#34d399"],
  ["Pull requests", prs, "#fbbf24"],
  ["Repos contributed to", u.repositoriesContributedTo.totalCount, "#f472b6"],
  ["Public repos", u.repositories.totalCount, "#94a3b8"],
];

const W = 1200, H = 360;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const tiles = metrics
  .map(([label, value, color], i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = 44 + col * 200, y = 96 + row * 118;
    return `<g class="fade" style="animation-delay:${0.1 + i * 0.12}s">
  <rect x="${x}" y="${y}" width="184" height="104" rx="14" fill="#0f172a" stroke="${color}" stroke-opacity=".35"/>
  <text class="sans" x="${x + 18}" y="${y + 54}" fill="${color}" font-size="36" font-weight="800">${fmt(value)}</text>
  <text class="sans" x="${x + 18}" y="${y + 84}" fill="#94a3b8" font-size="15">${esc(label)}</text>
</g>`;
  })
  .join("\n");

let off = 0;
const barX = 700, barW = 456;
const bar = top
  .map(([name, { size, color }]) => {
    const w = (size / totalSize) * barW;
    const seg = `<rect x="${barX + off}" y="112" width="${Math.max(w, 2)}" height="16" fill="${color}"/>`;
    off += w;
    return seg;
  })
  .join("");
const legend = top
  .map(([name, { size, color }], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = barX + col * 232, y = 172 + row * 44;
    return `<circle cx="${x + 8}" cy="${y - 6}" r="7" fill="${color}"/>
<text class="sans" x="${x + 24}" y="${y}" fill="#e2e8f0" font-size="17" font-weight="600">${esc(name)}</text>
<text class="mono" x="${x + 222}" y="${y}" fill="#94a3b8" font-size="15" text-anchor="end">${((size / totalSize) * 100).toFixed(1)}%</text>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="GitHub statistics for ${LOGIN}">
<title>GitHub telemetry for ${LOGIN}</title>
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#060a1a"/><stop offset="1" stop-color="#0f0b26"/></linearGradient>
<clipPath id="bar"><rect x="${barX}" y="112" width="${barW}" height="16" rx="8"/></clipPath>
<style>
.mono{font-family:'JetBrains Mono','SFMono-Regular',Consolas,Menlo,monospace}
.sans{font-family:'Inter','Segoe UI',-apple-system,Helvetica,Arial,sans-serif}
.fade{opacity:0;animation:in .7s cubic-bezier(.2,.7,.2,1) forwards}
@keyframes in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
</style>
</defs>
<rect width="${W}" height="${H}" rx="20" fill="url(#bg)"/>
<text class="mono" x="44" y="58" fill="#7dd3fc" font-size="17" letter-spacing="3">TELEMETRY</text>
<text class="mono" x="${W - 44}" y="58" fill="#64748b" font-size="15" text-anchor="end">auto-updated daily · ${new Date().toISOString().slice(0, 10)}</text>
${tiles}
<text class="mono" x="${barX}" y="96" fill="#94a3b8" font-size="15" letter-spacing="2">LANGUAGES · OWN + CONTRIBUTED REPOS</text>
<g clip-path="url(#bar)"><rect x="${barX}" y="112" width="${barW}" height="16" fill="#1e293b"/>${bar}</g>
${legend}
<rect x=".75" y=".75" width="${W - 1.5}" height="${H - 1.5}" rx="19.5" fill="none" stroke="#7dd3fc" stroke-opacity=".15" stroke-width="1.5"/>
</svg>
`;
writeFileSync(process.env.OUT || "assets/stats.svg", svg);

const weeks = u.contributionsCollection.contributionCalendar.weeks.map((w) => ({
  date: w.contributionDays[0].date,
  count: w.contributionDays.reduce((a, d) => a + d.contributionCount, 0),
}));
const AW = 1200, AH = 300, px = 60, top0 = 86, bottom = AH - 50;
const maxC = Math.max(1, ...weeks.map((w) => w.count));
const xs = (i) => px + (i * (AW - 2 * px)) / Math.max(1, weeks.length - 1);
const ys = (c) => bottom - Math.sqrt(c / maxC) * (bottom - top0);
const pts = weeks.map((w, i) => [xs(i), ys(w.count)]);
let d = `M${pts[0][0]},${pts[0][1]}`;
for (let i = 1; i < pts.length; i++) {
  const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], mx = (x0 + x1) / 2;
  d += ` C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
}
const area = `${d} L${pts.at(-1)[0]},${bottom} L${pts[0][0]},${bottom} Z`;
const peak = weeks.reduce((a, w, i) => (w.count > a.count ? { ...w, i } : a), { count: -1, i: 0 });
const months = weeks
  .map((w, i) => ({ i, m: w.date.slice(5, 7), label: new Date(w.date + "T00:00:00Z").toLocaleString("en-US", { month: "short", timeZone: "UTC" }) }))
  .filter((w, i, arr) => i === 0 || w.m !== arr[i - 1].m)
  .slice(1);
const grid = [0.25, 0.5, 0.75, 1]
  .map((f) => `<line x1="${px}" x2="${AW - px}" y1="${ys(maxC * f)}" y2="${ys(maxC * f)}" stroke="#1e293b" stroke-dasharray="3 6"/>`)
  .join("");
const activity = `<svg xmlns="http://www.w3.org/2000/svg" width="${AW}" height="${AH}" viewBox="0 0 ${AW} ${AH}" role="img" aria-label="Weekly contributions over the last year">
<title>Weekly contributions, last 12 months</title>
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#060a1a"/><stop offset="1" stop-color="#0f0b26"/></linearGradient>
<linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7c3aed" stop-opacity=".55"/><stop offset="1" stop-color="#7c3aed" stop-opacity="0"/></linearGradient>
<linearGradient id="line" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#38bdf8"/><stop offset="1" stop-color="#c4b5fd"/></linearGradient>
<style>
.mono{font-family:'JetBrains Mono','SFMono-Regular',Consolas,Menlo,monospace}
.draw{stroke-dasharray:4000;stroke-dashoffset:4000;animation:draw 3s cubic-bezier(.6,0,.2,1) forwards}
@keyframes draw{to{stroke-dashoffset:0}}
.area{opacity:0;animation:fade 1.2s 1.2s forwards}
@keyframes fade{to{opacity:1}}
</style>
</defs>
<rect width="${AW}" height="${AH}" rx="20" fill="url(#bg)"/>
<text class="mono" x="44" y="50" fill="#7dd3fc" font-size="17" letter-spacing="3">ACTIVITY · WEEKLY CONTRIBUTIONS (√ SCALE)</text>
<text class="mono" x="${AW - 44}" y="50" fill="#64748b" font-size="15" text-anchor="end">peak ${peak.count} in the week of ${peak.date}</text>
${grid}
<path class="area" d="${area}" fill="url(#fill)"/>
<path class="draw" d="${d}" fill="none" stroke="url(#line)" stroke-width="3" stroke-linecap="round"/>
<circle cx="${xs(peak.i)}" cy="${ys(peak.count)}" r="6" fill="#c4b5fd"><animate attributeName="r" values="5;9;5" dur="2s" repeatCount="indefinite"/></circle>
${months.map((m) => `<text class="mono" x="${xs(m.i)}" y="${AH - 20}" fill="#64748b" font-size="14" text-anchor="middle">${m.label}</text>`).join("")}
<rect x=".75" y=".75" width="${AW - 1.5}" height="${AH - 1.5}" rx="19.5" fill="none" stroke="#7dd3fc" stroke-opacity=".15" stroke-width="1.5"/>
</svg>
`;
writeFileSync(process.env.ACTIVITY_OUT || "assets/activity.svg", activity);
console.log(`wrote stats: ${allTime} all-time, ${commits} commits, ${prs} PRs, ${top.map((t) => t[0]).join(", ")}`);
