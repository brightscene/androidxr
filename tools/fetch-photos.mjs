// Runs on GitHub Actions (the dev sandbox can't reach image hosts). Unsplash
// blocks automated downloads, so candidates come from Wikimedia Commons
// (freely licensed, with author and licence recorded for the credits).
import fs from 'node:fs';
const UA = 'MindLyte/1.0 (https://brightscene.github.io/androidxr/; build script)';
const Q = JSON.parse(fs.readFileSync('tools/photo-queries.json', 'utf8'));
fs.mkdirSync('cand', { recursive: true });
const meta = [];
async function search(q, per) {
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  Object.entries({ action: 'query', format: 'json', generator: 'search', gsrnamespace: '6', gsrsearch: q, gsrlimit: String(per),
    prop: 'imageinfo', iiprop: 'url|extmetadata|size|mime', iiurlwidth: '900' }).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { headers: { 'User-Agent': UA } });
  const j = await r.json();
  return Object.values(j.query?.pages || {}).sort((a, b) => a.index - b.index);
}
let n = 0;
for (const { key, q, per = 6 } of Q) {
  let pages = [];
  try { pages = await search(q, per); } catch (e) { console.log(key, 'search failed', e.message); }
  for (const p of pages) {
    const ii = p.imageinfo?.[0]; if (!ii || !/jpeg|png/.test(ii.mime) || !ii.thumburl) continue;
    const name = `${key}-${String(n++).padStart(3, '0')}.jpg`;
    try {
      const r = await fetch(ii.thumburl, { headers: { 'User-Agent': UA } });
      if (!r.ok) { console.log('fail', r.status, ii.thumburl); continue; }
      fs.writeFileSync('cand/' + name, Buffer.from(await r.arrayBuffer()));
      const m = ii.extmetadata || {};
      const strip = (s) => (s || '').replace(/<[^>]+>/g, '').trim();
      meta.push({ file: name, key, title: p.title, page: ii.descriptionurl, thumb: ii.thumburl, w: ii.width, h: ii.height,
        artist: strip(m.Artist?.value), license: strip(m.LicenseShortName?.value), licenseUrl: m.LicenseUrl?.value || '' });
      await new Promise((res) => setTimeout(res, 150));
    } catch (e) { console.log('err', e.message); }
  }
}
fs.writeFileSync('cand/meta.json', JSON.stringify(meta, null, 1));
console.log('downloaded', meta.length);
