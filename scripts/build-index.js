// Merges split domain files (dNa.json + dNb.json -> dN.json) and writes data/secplus/index.json
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'data', 'secplus');
const read = f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const exists = f => fs.existsSync(path.join(dir, f));

for (const n of [1, 2, 3, 4, 5]) {
  const a = `d${n}a.json`, b = `d${n}b.json`;
  if (exists(a) && exists(b)) {
    const A = read(a), B = read(b);
    const merged = Object.assign({}, A, { intro: A.intro || B.intro, objectives: A.objectives.concat(B.objectives) });
    fs.writeFileSync(path.join(dir, `d${n}.json`), JSON.stringify(merged));
    console.log(`merged ${a} + ${b} -> d${n}.json`);
  }
}

const domains = [];
const ids = new Set(); let problems = 0;
for (const n of [1, 2, 3, 4, 5]) {
  const f = `d${n}.json`;
  if (!exists(f)) { console.warn(`missing ${f}`); continue; }
  const d = read(f);
  let videos = 0;
  for (const o of d.objectives) for (const v of o.videos) {
    videos++;
    if (ids.has(v.id)) { console.error(`duplicate id ${v.id}`); problems++; }
    ids.add(v.id);
    if (!v.quiz || (v.quiz.length !== 3 && v.quiz.length !== 6)) { console.error(`${v.id}: quiz has ${(v.quiz || []).length} questions`); problems++; }
    if (/"/.test(v.deepDive)) { console.error(`${v.id}: double quote in deepDive`); problems++; }
    if ((v.deepDive || '').length < 1500) { console.error(`${v.id}: deepDive short (${(v.deepDive || '').length})`); problems++; }
  }
  domains.push({ id: d.id, number: d.number, title: d.title, weight: d.weight, videos });
}
fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ domains, generated: new Date().toISOString() }, null, 2));
console.log('index.json:', domains.map(d => `${d.id}=${d.videos}`).join(' '), 'total', domains.reduce((a, d) => a + d.videos, 0));
if (problems) { console.error(`${problems} problem(s)`); process.exit(1); }
