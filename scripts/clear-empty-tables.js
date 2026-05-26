const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('database.sqlite');
const tables = ['payments', 'notifications', 'complaints', 'billings', 'auditLog', 'announcements'];

db.serialize(() => {
  for (const table of tables) {
    db.run(`DELETE FROM ${table}`);
  }

  const checks = tables.map((table) =>
    new Promise((resolve, reject) => {
      db.get(`SELECT COUNT(*) AS count FROM ${table}`, (error, row) => {
        if (error) reject(error);
        else resolve({ table, count: row.count });
      });
    })
  );

  Promise.all(checks)
    .then((rows) => {
      console.log(JSON.stringify(rows, null, 2));
      db.close();
    })
    .catch((error) => {
      console.error(error);
      db.close();
      process.exitCode = 1;
    });
});
