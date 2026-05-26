const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('database.sqlite');
const homeowners = JSON.parse(fs.readFileSync('data/homeowners.seed.json', 'utf8').replace(/^\uFEFF/, ''));

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) reject(error);
      else resolve(row);
    });
  });
}

(async () => {
  await run('ALTER TABLE users ADD COLUMN lotArea REAL').catch(() => {});
  await run('CREATE TABLE IF NOT EXISTS appSettings (id TEXT PRIMARY KEY, value TEXT)');
  await run(
    'INSERT INTO appSettings (id, value) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value',
    ['duesRatePerSqm', '5.725']
  );

  for (const user of homeowners) {
    await run('UPDATE users SET lotArea = ? WHERE id = ?', [user.lotArea || 0, user.id]);
  }

  const areaCheck = await get('SELECT COUNT(*) AS count FROM users WHERE role = ? AND lotArea IS NOT NULL', ['homeowner']);
  const setting = await get('SELECT value FROM appSettings WHERE id = ?', ['duesRatePerSqm']);
  console.log(JSON.stringify({ homeownersWithLotArea: areaCheck.count, duesRatePerSqm: setting.value }, null, 2));
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
