const express = require('express');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'database.sqlite');

const db = new sqlite3.Database(DB_PATH);

app.use(express.json({ limit: '15mb' }));
app.use(express.static(__dirname));

const tableConfig = {
  users: {
    columns: ['id', 'username', 'password', 'role', 'name', 'email', 'block', 'lot', 'lotArea', 'contact', 'balance'],
    jsonColumns: [],
    booleanColumns: [],
  },
  billings: {
    columns: ['id', 'title', 'amount', 'dueDate', 'description', 'assignedTo', 'status', 'createdAt'],
    jsonColumns: ['assignedTo'],
    booleanColumns: [],
  },
  payments: {
    columns: ['id', 'homeownerId', 'billingId', 'amount', 'refNum', 'status', 'receipt', 'submittedAt', 'remarks', 'reviewedAt'],
    jsonColumns: [],
    booleanColumns: [],
  },
  announcements: {
    columns: ['id', 'title', 'description', 'category', 'date', 'urgent', 'createdBy'],
    jsonColumns: [],
    booleanColumns: ['urgent'],
  },
  complaints: {
    columns: ['id', 'homeownerId', 'category', 'description', 'status', 'adminResponse', 'dateFiled', 'updatedAt', 'resolvedAt'],
    jsonColumns: [],
    booleanColumns: [],
  },
  amenityBookings: {
    columns: ['id', 'homeownerId', 'amenity', 'bookingDate', 'startTime', 'endTime', 'purpose', 'status', 'adminRemarks', 'createdAt', 'reviewedAt'],
    jsonColumns: [],
    booleanColumns: [],
  },
  auditLog: {
    columns: ['id', 'action', 'adminId', 'timestamp'],
    jsonColumns: [],
    booleanColumns: [],
  },
  notifications: {
    columns: ['id', 'title', 'message', 'time'],
    jsonColumns: [],
    booleanColumns: [],
  },
  appSettings: {
    columns: ['id', 'value'],
    jsonColumns: [],
    booleanColumns: [],
  },
};

const adminUser = {
  id: 'u001',
  username: 'admin',
  password: 'admin123',
  role: 'admin',
  name: 'Maria Santos',
  email: 'admin@sanalfonsohomes.com',
  block: null,
  lot: null,
  lotArea: null,
  contact: null,
  balance: 0,
};

function loadHomeownerSeed() {
  const seedPath = path.join(__dirname, 'data', 'homeowners.seed.json');
  try {
    const raw = fs.readFileSync(seedPath, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`Could not load homeowner seed from ${seedPath}. Falling back to demo homeowners.`);
    return [
      { id: 'u002', username: 'juandelacruz', password: 'home123', role: 'homeowner', name: 'Juan Dela Cruz', email: 'juan@email.com', block: 'Block 3', lot: 'Lot 7', lotArea: 0, contact: '09171234567', balance: 3500 },
      { id: 'u003', username: 'annamaria', password: 'home123', role: 'homeowner', name: 'Anna Maria Reyes', email: 'anna@email.com', block: 'Block 1', lot: 'Lot 2', lotArea: 0, contact: '09281234567', balance: 0 },
      { id: 'u004', username: 'carlosmagno', password: 'home123', role: 'homeowner', name: 'Carlos Magno', email: 'carlos@email.com', block: 'Block 2', lot: 'Lot 5', lotArea: 0, contact: '09351234567', balance: 7000 },
      { id: 'u005', username: 'ritaflores', password: 'home123', role: 'homeowner', name: 'Rita Flores', email: 'rita@email.com', block: 'Block 4', lot: 'Lot 1', lotArea: 0, contact: '09461234567', balance: 1500 },
      { id: 'u006', username: 'pedroparcero', password: 'home123', role: 'homeowner', name: 'Pedro Parcero', email: 'pedro@email.com', block: 'Block 1', lot: 'Lot 8', lotArea: 0, contact: '09571234567', balance: 0 },
    ];
  }
}

const seed = {
  users: [adminUser, ...loadHomeownerSeed()],
  billings: [],
  payments: [],
  announcements: [],
  complaints: [],
  amenityBookings: [],
  auditLog: [],
  notifications: [],
  appSettings: [{ id: 'duesRatePerSqm', value: '5.725' }],
};

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function serializeValue(table, column, value) {
  const config = tableConfig[table];
  if (config.jsonColumns.includes(column)) return JSON.stringify(value || []);
  if (config.booleanColumns.includes(column)) return value ? 1 : 0;
  return value === undefined ? null : value;
}

function deserializeRow(table, row) {
  const config = tableConfig[table];
  const output = { ...row };

  for (const column of config.jsonColumns) {
    try {
      output[column] = row[column] ? JSON.parse(row[column]) : [];
    } catch {
      output[column] = [];
    }
  }

  for (const column of config.booleanColumns) {
    output[column] = Boolean(row[column]);
  }

  return output;
}

function validateTable(req, res) {
  const table = req.params.table;
  if (!tableConfig[table]) {
    res.status(404).json({ error: 'Unknown table.' });
    return null;
  }
  return table;
}

async function saveRecord(table, item) {
  if (!item.id) throw new Error('Record id is required.');

  const columns = tableConfig[table].columns;
  const existing = await get(`SELECT id FROM ${table} WHERE id = ?`, [item.id]);
  const values = columns.map((column) => serializeValue(table, column, item[column]));

  if (existing) {
    const setClause = columns.filter((column) => column !== 'id').map((column) => `${column} = ?`).join(', ');
    const updateValues = columns.filter((column) => column !== 'id').map((column) => serializeValue(table, column, item[column]));
    await run(`UPDATE ${table} SET ${setClause} WHERE id = ?`, [...updateValues, item.id]);
  } else {
    const placeholders = columns.map(() => '?').join(', ');
    await run(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`, values);
  }
}

async function getTableData(table) {
  const rows = await all(`SELECT * FROM ${table}`);
  return rows.map((row) => deserializeRow(table, row));
}

async function loadAllData() {
  const data = {};
  for (const table of Object.keys(tableConfig)) {
    data[table] = await getTableData(table);
  }
  return data;
}

async function createTables() {
  await run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT,
    name TEXT,
    email TEXT,
    block TEXT,
    lot TEXT,
    lotArea REAL,
    contact TEXT,
    balance REAL DEFAULT 0
  )`);
  await run('ALTER TABLE users ADD COLUMN lotArea REAL').catch(() => {});

  await run(`CREATE TABLE IF NOT EXISTS billings (
    id TEXT PRIMARY KEY,
    title TEXT,
    amount REAL,
    dueDate TEXT,
    description TEXT,
    assignedTo TEXT,
    status TEXT,
    createdAt TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    homeownerId TEXT,
    billingId TEXT,
    amount REAL,
    refNum TEXT,
    status TEXT,
    receipt TEXT,
    submittedAt TEXT,
    remarks TEXT,
    reviewedAt TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY,
    title TEXT,
    description TEXT,
    category TEXT,
    date TEXT,
    urgent INTEGER DEFAULT 0,
    createdBy TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS complaints (
    id TEXT PRIMARY KEY,
    homeownerId TEXT,
    category TEXT,
    description TEXT,
    status TEXT,
    adminResponse TEXT,
    dateFiled TEXT,
    updatedAt TEXT,
    resolvedAt TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS amenityBookings (
    id TEXT PRIMARY KEY,
    homeownerId TEXT,
    amenity TEXT,
    bookingDate TEXT,
    startTime TEXT,
    endTime TEXT,
    purpose TEXT,
    status TEXT,
    adminRemarks TEXT,
    createdAt TEXT,
    reviewedAt TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS auditLog (
    id TEXT PRIMARY KEY,
    action TEXT,
    adminId TEXT,
    timestamp TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    title TEXT,
    message TEXT,
    time TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS appSettings (
    id TEXT PRIMARY KEY,
    value TEXT
  )`);
}

async function seedIfEmpty() {
  const row = await get('SELECT COUNT(*) AS count FROM users');
  if (row.count > 0) return;

  for (const [table, records] of Object.entries(seed)) {
    for (const record of records) {
      await saveRecord(table, record);
    }
  }
}

async function resetDatabase() {
  for (const table of Object.keys(tableConfig)) {
    await run(`DELETE FROM ${table}`);
  }

  for (const [table, records] of Object.entries(seed)) {
    for (const record of records) {
      await saveRecord(table, record);
    }
  }
}

app.get('/api/health', async (req, res) => {
  const row = await get('SELECT COUNT(*) AS users FROM users');
  res.json({ ok: true, database: DB_PATH, users: row.users });
});

app.get('/api/data', async (req, res) => {
  res.json(await loadAllData());
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);
  if (!user) {
    res.status(401).json({ error: 'Invalid username or password.' });
    return;
  }
  res.json(deserializeRow('users', user));
});

app.get('/api/:table', async (req, res) => {
  const table = validateTable(req, res);
  if (!table) return;
  res.json(await getTableData(table));
});

app.put('/api/:table', async (req, res) => {
  const table = validateTable(req, res);
  if (!table) return;
  if (!Array.isArray(req.body)) {
    res.status(400).json({ error: 'Expected an array of records.' });
    return;
  }

  await run(`DELETE FROM ${table}`);
  for (const item of req.body) {
    await saveRecord(table, item);
  }
  res.json(await getTableData(table));
});

app.post('/api/:table', async (req, res) => {
  const table = validateTable(req, res);
  if (!table) return;
  await saveRecord(table, req.body);
  res.status(201).json(req.body);
});

app.put('/api/:table/:id', async (req, res) => {
  const table = validateTable(req, res);
  if (!table) return;
  const item = { ...req.body, id: req.params.id };
  await saveRecord(table, item);
  res.json(item);
});

app.delete('/api/:table/:id', async (req, res) => {
  const table = validateTable(req, res);
  if (!table) return;
  await run(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

app.post('/api/reset', async (req, res) => {
  await resetDatabase();
  res.json(await loadAllData());
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error. Check the VS Code terminal.' });
});

createTables()
  .then(seedIfEmpty)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`SmartHood is running at http://localhost:${PORT}`);
      console.log(`SQLite database: ${DB_PATH}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start server:', err);
  });
