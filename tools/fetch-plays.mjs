// tools/fetch-plays.mjs
// 由 tomomai 抄最近 N 場成績去 plays.json。
// 由 GitHub Actions 喺伺服器上面執行 —— 伺服器冇瀏覽器嘅 CORS 限制，所以讀得到。
//
// 只用公開 API，唔使登入、唔使 token。

import { writeFileSync } from 'node:fs';

const API = 'https://www.tomomai.lol/api/trpc/';
const USERNAME = process.env.TOMOMAI_USER || 'steven';
const REGION = process.env.TOMOMAI_REGION || 'intl';
const LIMIT = Number(process.env.TOMOMAI_LIMIT || 10);
const KINDS = ['tap', 'hold', 'slide', 'touch', 'break'];
const LEVELS = ['CPerfect', 'Perfect', 'Great', 'Good', 'Miss'];

async function trpc(proc, payload) {
  const url = API + proc + '?input=' + encodeURIComponent(JSON.stringify({ json: payload }));
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  const txt = await res.text();
  let j = null;
  try { j = JSON.parse(txt); } catch {
    throw new Error(`${proc}: HTTP ${res.status}，回傳唔係 JSON`);
  }
  if (j.error) throw new Error(`${proc}: ${j.error.json?.message || 'HTTP ' + res.status}`);
  if (!j.result) throw new Error(`${proc}: HTTP ${res.status}，冇 result`);
  return j.result.data.json;
}

// 某個判定類型嘅總數（CP+P+G+GD+M）
const totalOf = (p, k) => LEVELS.reduce((a, s) => a + (p[k + s] || 0), 0);

// 1. 攞最新 snapshot（入面有 snapshotId）
const snap = await trpc('user.getPublicSnapshotData', { username: USERNAME, region: REGION });
const snapshotId = snap?.snapshot?.id;
if (!snapshotId) throw new Error('搵唔到 snapshotId，可能個 profile 改咗名或者未公開');

// 2. 攞最近遊玩
const rec = await trpc('user.getPublicRecentSongs', { snapshotId, region: REGION });
const list = rec.recentPlays || rec.plays || [];

// 3. 整理成工具要嘅格式
const plays = [];
for (const p of list) {
  if (plays.length >= LIMIT) break;
  const f = p.fastCount || 0;
  const l = p.lateCount || 0;
  if (f + l === 0) continue;              // 冇 FAST/LATE 嘅場（例如全部 MISS）冇用
  if (p.achievement === 0) continue;      // 未玩完
  let cp = 0, perfect = 0;
  for (const k of KINDS) {
    cp += p[k + 'CPerfect'] || 0;
    perfect += p[k + 'Perfect'] || 0;
  }
  plays.push({
    cp,                                 // 總 Critical Perfect
    p: perfect,                         // 總 Perfect
    sl: totalOf(p, 'slide'),            // 滑鍵總數（要扣走，因為佢永遠 CP）
    tc: totalOf(p, 'touch'),            // 觸控總數（同上）
    f, l,                               // FAST / LATE
  });
  // ⚠️ 故意唔存歌名，避免成績詳情被公開搜到
}

if (!plays.length) throw new Error('一場都用唔到（全部都冇 FAST/LATE）');

writeFileSync('plays.json', JSON.stringify({
  updated: new Date().toISOString(),
  source: `https://www.tomomai.lol/profile/${USERNAME}/${REGION}`,
  username: USERNAME,
  region: REGION,
  plays,
}, null, 2) + '\n');

const F = plays.reduce((a, x) => a + x.f, 0);
const L = plays.reduce((a, x) => a + x.l, 0);
console.log(`✓ 寫咗 ${plays.length} 場，FAST ${F} / LATE ${L} → plays.json`);
