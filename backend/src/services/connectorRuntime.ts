import axios from 'axios';
import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

type LogFn = (level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR', message: string) => Promise<void> | void;

export interface SourceResult {
  stream: string;
  records: Record<string, any>[];
}

const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const EXPORT_DIR = path.resolve(process.env.EXPORT_DIR || './exports');

function assertIdentifier(name: string, what: string): string {
  if (!IDENTIFIER.test(name)) {
    throw new Error(`Invalid ${what}: "${name}" (letters, digits and underscores only)`);
  }
  return name;
}

function safeFileName(name: string, fallback: string): string {
  const base = path.basename(String(name || fallback));
  if (!base || base.startsWith('.')) {
    throw new Error(`Invalid file name: "${name}"`);
  }
  return base;
}

function exportPath(name: string, fallback: string): string {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  return path.join(EXPORT_DIR, safeFileName(name, fallback));
}

// ---------- Connector catalog / specs ----------

export interface ConfigField {
  key: string;
  label: string;
  kind: 'text' | 'password' | 'number' | 'textarea';
  required?: boolean;
  placeholder?: string;
  defaultValue?: any;
  help?: string;
}

export interface ConnectorSpec {
  name: string;
  type: 'SOURCE' | 'DESTINATION';
  displayName: string;
  description: string;
  implemented: boolean;
  fields: ConfigField[];
}

const PG_FIELDS: ConfigField[] = [
  { key: 'host', label: 'Host', kind: 'text', required: true, placeholder: 'postgres or localhost' },
  { key: 'port', label: 'Port', kind: 'number', required: true, defaultValue: 5432 },
  { key: 'database', label: 'Database', kind: 'text', required: true },
  { key: 'user', label: 'User', kind: 'text', required: true },
  { key: 'password', label: 'Password', kind: 'password', required: true }
];

export const CONNECTOR_SPECS: ConnectorSpec[] = [
  {
    name: 'source-faker',
    type: 'SOURCE',
    displayName: 'Faker (sample data)',
    description: 'Generates fake user records — no credentials needed',
    implemented: true,
    fields: [
      { key: 'count', label: 'Record count', kind: 'number', defaultValue: 100, help: '1–100000 rows per sync' }
    ]
  },
  {
    name: 'source-postgres',
    type: 'SOURCE',
    displayName: 'PostgreSQL',
    description: 'Read a table or SQL query from Postgres',
    implemented: true,
    fields: [
      ...PG_FIELDS,
      { key: 'table', label: 'Table', kind: 'text', placeholder: 'e.g. orders (or use Query)' },
      { key: 'query', label: 'Query (overrides Table)', kind: 'textarea', placeholder: 'SELECT * FROM orders' },
      { key: 'stream', label: 'Stream name', kind: 'text', placeholder: 'defaults to table name' },
      { key: 'limit', label: 'Row limit', kind: 'number', defaultValue: 10000 }
    ]
  },
  {
    name: 'source-http',
    type: 'SOURCE',
    displayName: 'HTTP / REST API',
    description: 'Fetch JSON records from any HTTP endpoint',
    implemented: true,
    fields: [
      { key: 'url', label: 'URL', kind: 'text', required: true, placeholder: 'https://api.example.com/items' },
      { key: 'stream', label: 'Stream name', kind: 'text', placeholder: 'records' },
      { key: 'dataPath', label: 'Data path', kind: 'text', placeholder: 'e.g. results — path to the array in the response' }
    ]
  },
  {
    name: 'source-csv',
    type: 'SOURCE',
    displayName: 'CSV file',
    description: 'Read a CSV file from the platform exports folder',
    implemented: true,
    fields: [
      { key: 'path', label: 'File name', kind: 'text', required: true, placeholder: 'input.csv' },
      { key: 'stream', label: 'Stream name', kind: 'text', placeholder: 'defaults to file name' }
    ]
  },
  {
    name: 'source-mysql',
    type: 'SOURCE',
    displayName: 'MySQL',
    description: 'MySQL database',
    implemented: false,
    fields: [
      { key: 'host', label: 'Host', kind: 'text', required: true },
      { key: 'port', label: 'Port', kind: 'number', defaultValue: 3306 },
      { key: 'database', label: 'Database', kind: 'text', required: true },
      { key: 'user', label: 'User', kind: 'text', required: true },
      { key: 'password', label: 'Password', kind: 'password', required: true },
      { key: 'table', label: 'Table', kind: 'text', required: true }
    ]
  },
  {
    name: 'source-s3',
    type: 'SOURCE',
    displayName: 'Amazon S3',
    description: 'Amazon S3 storage',
    implemented: false,
    fields: []
  },
  {
    name: 'destination-postgres',
    type: 'DESTINATION',
    displayName: 'PostgreSQL',
    description: 'Write records into a Postgres table (JSONB)',
    implemented: true,
    fields: [
      ...PG_FIELDS,
      { key: 'table', label: 'Table', kind: 'text', placeholder: 'defaults to synced_<stream>' }
    ]
  },
  {
    name: 'destination-duckdb',
    type: 'DESTINATION',
    displayName: 'DuckDB',
    description: 'Write records into a local DuckDB file (analytics)',
    implemented: true,
    fields: [
      { key: 'path', label: 'Database file', kind: 'text', required: true, placeholder: 'warehouse.duckdb', help: `Stored under ${EXPORT_DIR}` },
      { key: 'table', label: 'Table', kind: 'text', placeholder: 'defaults to stream name' }
    ]
  },
  {
    name: 'destination-csv',
    type: 'DESTINATION',
    displayName: 'CSV file',
    description: 'Append records to a CSV file in the exports folder',
    implemented: true,
    fields: [
      { key: 'fileName', label: 'File name', kind: 'text', placeholder: 'defaults to <stream>.csv' }
    ]
  },
  {
    name: 'destination-jsonl',
    type: 'DESTINATION',
    displayName: 'JSON Lines file',
    description: 'Append records as JSON lines in the exports folder',
    implemented: true,
    fields: [
      { key: 'fileName', label: 'File name', kind: 'text', placeholder: 'defaults to <stream>.jsonl' }
    ]
  },
  {
    name: 'destination-databricks',
    type: 'DESTINATION',
    displayName: 'Databricks',
    description: 'Databricks SQL warehouse (Delta table)',
    implemented: true,
    fields: [
      { key: 'host', label: 'Workspace host', kind: 'text', required: true, placeholder: 'dbc-xxxx.cloud.databricks.com' },
      { key: 'token', label: 'Access token', kind: 'password', required: true },
      { key: 'warehouse_id', label: 'SQL warehouse ID', kind: 'text', required: true },
      { key: 'catalog', label: 'Catalog', kind: 'text' },
      { key: 'schema', label: 'Schema', kind: 'text', defaultValue: 'default' },
      { key: 'table', label: 'Table', kind: 'text', placeholder: 'defaults to synced_<stream>' }
    ]
  },
  {
    name: 'destination-snowflake',
    type: 'DESTINATION',
    displayName: 'Snowflake',
    description: 'Snowflake data warehouse',
    implemented: false,
    fields: []
  },
  {
    name: 'destination-bigquery',
    type: 'DESTINATION',
    displayName: 'BigQuery',
    description: 'Google BigQuery',
    implemented: false,
    fields: []
  }
];

export function connectorSpec(name: string): ConnectorSpec | undefined {
  return CONNECTOR_SPECS.find((s) => s.name === name);
}

export function implementedConnectors(type?: 'SOURCE' | 'DESTINATION'): string[] {
  return CONNECTOR_SPECS.filter((s) => s.implemented && (!type || s.type === type)).map((s) => s.name);
}

/**
 * Validate a connector config at creation time.
 * Throws an Error with a human-readable message if invalid.
 */
export function assertValidConnectorConfig(connectorName: string, config: any) {
  const spec = connectorSpec(connectorName);
  if (!spec) {
    throw new Error(`Unknown connector "${connectorName}". See GET /api/connectors/catalog.`);
  }
  if (!spec.implemented) {
    throw new Error(`Connector "${connectorName}" is not available yet. Available ${spec.type.toLowerCase()}s: ${implementedConnectors(spec.type).join(', ')}`);
  }
  const missing = spec.fields
    .filter((f) => f.required)
    .filter((f) => config?.[f.key] === undefined || config?.[f.key] === null || config?.[f.key] === '')
    .map((f) => f.key);
  if (missing.length) {
    throw new Error(`Connector "${connectorName}" is missing required config: ${missing.join(', ')}`);
  }
}

// ---------- Sources ----------

const FIRST_NAMES = ['Aarav', 'Maya', 'Liam', 'Sofia', 'Noah', 'Priya', 'Emma', 'Ravi', 'Olivia', 'Kenji'];
const LAST_NAMES = ['Sharma', 'Garcia', 'Smith', 'Chen', 'Patel', 'Mueller', 'Okafor', 'Tanaka', 'Silva', 'Novak'];
const CITIES = ['Mumbai', 'Berlin', 'Austin', 'Tokyo', 'Lagos', 'Sao Paulo', 'Prague', 'Toronto', 'Nairobi', 'Sydney'];

function fakerSource(config: any): SourceResult {
  const count = Math.min(Number(config?.count) || 100, 100000);
  const records = Array.from({ length: count }, (_, i) => {
    const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    return {
      id: i + 1,
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@example.com`,
      city: CITIES[Math.floor(Math.random() * CITIES.length)],
      amount: Math.round(Math.random() * 100000) / 100,
      created_at: new Date(Date.now() - Math.floor(Math.random() * 90) * 86400000).toISOString()
    };
  });
  return { stream: 'users', records };
}

async function postgresSource(config: any, log: LogFn): Promise<SourceResult> {
  if (!config?.host || !config?.database) {
    throw new Error('source-postgres config requires: host, port, database, user, password, and table or query');
  }
  const client = new Client({
    host: config.host,
    port: Number(config.port) || 5432,
    database: config.database,
    user: config.user,
    password: config.password,
    connectionTimeoutMillis: 10000
  });
  await client.connect();
  try {
    let sql: string;
    let stream: string;
    if (config.query) {
      sql = String(config.query);
      stream = config.stream || 'query_result';
    } else if (config.table) {
      const table = assertIdentifier(String(config.table), 'table name');
      const limit = Math.min(Number(config.limit) || 10000, 1000000);
      sql = `SELECT * FROM "${table}" LIMIT ${limit}`;
      stream = table;
    } else {
      throw new Error('source-postgres config requires either "table" or "query"');
    }
    await log('INFO', `Executing: ${sql}`);
    const result = await client.query(sql);
    return { stream, records: result.rows };
  } finally {
    await client.end().catch(() => {});
  }
}

function getByPath(obj: any, dotted: string): any {
  return dotted.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

async function httpSource(config: any, log: LogFn): Promise<SourceResult> {
  if (!config?.url) {
    throw new Error('source-http config requires: url (optional: stream, dataPath)');
  }
  const stream = config.stream ? assertIdentifier(String(config.stream), 'stream name') : 'records';
  await log('INFO', `GET ${config.url}`);
  const response = await axios.get(String(config.url), { timeout: 30000 });
  let data = response.data;
  if (config.dataPath) {
    data = getByPath(data, String(config.dataPath));
  }
  if (!Array.isArray(data)) {
    // If the response is an object containing a single array property, use it.
    const arrayProp = data && typeof data === 'object'
      ? Object.keys(data).find((k) => Array.isArray(data[k]))
      : undefined;
    if (arrayProp) {
      data = data[arrayProp];
    } else if (data && typeof data === 'object') {
      data = [data];
    } else {
      throw new Error('source-http: response is not a JSON array — set dataPath to the array field');
    }
  }
  const records = (data as any[]).map((r) => (r && typeof r === 'object' ? r : { value: r }));
  await log('INFO', `HTTP ${response.status}: ${records.length} records`);
  return { stream, records };
}

function parseCsv(text: string): Record<string, any>[] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.some((f) => f !== '')) rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim() || 'col');
  return rows.slice(1).map((r) => {
    const rec: Record<string, any> = {};
    headers.forEach((h, idx) => {
      const v = r[idx] ?? '';
      rec[h] = v !== '' && !isNaN(Number(v)) ? Number(v) : v;
    });
    return rec;
  });
}

async function csvSource(config: any, log: LogFn): Promise<SourceResult> {
  if (!config?.path) {
    throw new Error('source-csv config requires: path (file inside the exports folder)');
  }
  const file = exportPath(config.path, config.path);
  if (!fs.existsSync(file)) {
    throw new Error(`source-csv: file not found: ${file}`);
  }
  const stream = config.stream
    ? assertIdentifier(String(config.stream), 'stream name')
    : path.basename(file, path.extname(file)).replace(/[^a-zA-Z0-9_]/g, '_');
  const records = parseCsv(fs.readFileSync(file, 'utf8'));
  await log('INFO', `Read ${records.length} records from ${file}`);
  return { stream, records };
}

// ---------- Destinations ----------

async function postgresDestination(
  config: any,
  records: Record<string, any>[],
  stream: string,
  log: LogFn
): Promise<number> {
  if (!config?.host || !config?.database) {
    throw new Error('destination-postgres config requires: host, port, database, user, password (optional: table)');
  }
  const table = assertIdentifier(String(config.table || `synced_${stream}`), 'table name');
  const client = new Client({
    host: config.host,
    port: Number(config.port) || 5432,
    database: config.database,
    user: config.user,
    password: config.password,
    connectionTimeoutMillis: 10000
  });
  await client.connect();
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS "${table}" (
        _id BIGSERIAL PRIMARY KEY,
        data JSONB NOT NULL,
        _synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`
    );
    let written = 0;
    const BATCH = 1000;
    for (let i = 0; i < records.length; i += BATCH) {
      const batch = records.slice(i, i + BATCH);
      await client.query(
        `INSERT INTO "${table}" (data) SELECT * FROM jsonb_array_elements($1::jsonb)`,
        [JSON.stringify(batch)]
      );
      written += batch.length;
    }
    await log('INFO', `Wrote ${written} records into table "${table}"`);
    return written;
  } finally {
    await client.end().catch(() => {});
  }
}

// ---------- CSV / JSONL destinations ----------

function csvEscape(value: any): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function csvDestination(
  config: any,
  records: Record<string, any>[],
  stream: string,
  log: LogFn
): Promise<number> {
  const file = exportPath(config?.fileName, `${stream}.csv`);
  const columns = Array.from(new Set(records.flatMap((r) => Object.keys(r))));
  const exists = fs.existsSync(file) && fs.statSync(file).size > 0;
  const lines = records.map((r) => columns.map((c) => csvEscape(r[c])).join(','));
  const payload = (exists ? '' : columns.join(',') + '\n') + lines.join('\n') + (lines.length ? '\n' : '');
  fs.appendFileSync(file, payload);
  await log('INFO', `Appended ${records.length} records to ${file}`);
  return records.length;
}

async function jsonlDestination(
  config: any,
  records: Record<string, any>[],
  stream: string,
  log: LogFn
): Promise<number> {
  const file = exportPath(config?.fileName, `${stream}.jsonl`);
  const payload = records.map((r) => JSON.stringify(r)).join('\n') + (records.length ? '\n' : '');
  fs.appendFileSync(file, payload);
  await log('INFO', `Appended ${records.length} records to ${file}`);
  return records.length;
}

// ---------- DuckDB destination ----------

// DuckDB file handles stay open until process exit in the node bindings, so we
// pool one Database per file path (like a warehouse connection pool) instead of
// open/close per job.
const duckdbPool = new Map<string, any>();

function getDuckDb(file: string): any {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const duckdb = require('duckdb');
  let db = duckdbPool.get(file);
  if (!db) {
    db = new duckdb.Database(file);
    duckdbPool.set(file, db);
  }
  return db;
}

function duckdbRun(db: any, sql: string, params: any[] = []): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    db.run(sql, ...params, (err: Error | null) => (err ? reject(err) : resolve()));
  });
}

type DuckColumn = { name: string; type: 'BIGINT' | 'DOUBLE' | 'BOOLEAN' | 'VARCHAR' };

function sanitizeColumnName(key: string): string {
  const cleaned = key.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^([0-9])/, '_$1');
  if (!cleaned) throw new Error('Record contains an unusable column name');
  return cleaned;
}

function inferColumns(records: Record<string, any>[]): DuckColumn[] {
  const types = new Map<string, 'BIGINT' | 'DOUBLE' | 'BOOLEAN' | 'VARCHAR'>();
  for (const r of records) {
    for (const key of Object.keys(r)) {
      const col = sanitizeColumnName(key);
      const v = r[key];
      const prev = types.get(col);
      if (v === null || v === undefined) continue;
      const t =
        typeof v === 'boolean' ? 'BOOLEAN'
        : typeof v === 'number' ? (Number.isInteger(v) ? 'BIGINT' : 'DOUBLE')
        : 'VARCHAR';
      if (!prev) types.set(col, t);
      else if (prev !== t) types.set(col, prev === 'DOUBLE' && t === 'BIGINT' ? 'DOUBLE' : 'VARCHAR');
    }
  }
  return Array.from(types.entries()).map(([name, type]) => ({ name, type }));
}

async function duckdbDestination(
  config: any,
  records: Record<string, any>[],
  stream: string,
  log: LogFn
): Promise<number> {
  if (!config?.path) {
    throw new Error('destination-duckdb config requires: path (database file name, e.g. warehouse.duckdb)');
  }
  const file = exportPath(config.path, 'warehouse.duckdb');
  const table = assertIdentifier(String(config.table || stream), 'table name');
  if (!records.length) {
    await log('INFO', 'No records to write');
    return 0;
  }

  // Map original keys -> sanitized column names
  const keyMap = new Map<string, string>();
  for (const r of records) {
    for (const k of Object.keys(r)) keyMap.set(k, sanitizeColumnName(k));
  }
  const columns = inferColumns(
    records.map((r) => {
      const o: Record<string, any> = {};
      for (const [k, v] of Object.entries(r)) o[keyMap.get(k)!] = v;
      return o;
    })
  );

  const db = getDuckDb(file);

  const colsDdl = columns
    .map((c) => `"${c.name}" ${c.type}`)
    .join(', ');
  await duckdbRun(db, `CREATE TABLE IF NOT EXISTS "${table}" (${colsDdl}, _synced_at TIMESTAMP)`);
  await log('INFO', `Ensured DuckDB table "${table}" in ${file}`);

  const placeholders = columns.map(() => '?').join(', ');
  const stmt = db.prepare(
    `INSERT INTO "${table}" (${columns.map((c) => `"${c.name}"`).join(', ')}, _synced_at) VALUES (${placeholders}, current_timestamp)`
  );
  const stmtRun = (params: any[]) =>
    new Promise<void>((resolve, reject) => {
      stmt.run(...params, (err: Error | null) => (err ? reject(err) : resolve()));
    });

  let written = 0;
  for (const r of records) {
    const normalized: Record<string, any> = {};
    for (const [k, v] of Object.entries(r)) normalized[keyMap.get(k)!] = v;
    const params = columns.map((c) => {
      const v = normalized[c.name];
      if (v === undefined || v === null) return null;
      if (c.type === 'VARCHAR' && typeof v === 'object') return JSON.stringify(v);
      return v;
    });
    await stmtRun(params);
    written++;
  }
  await new Promise<void>((resolve, reject) => {
    stmt.finalize((err: Error | null) => (err ? reject(err) : resolve()));
  });
  // Merge the WAL into the main file so the data is durable and the file is
  // consistent for external readers.
  await duckdbRun(db, 'CHECKPOINT').catch(() => {});
  await log('INFO', `Wrote ${written} records into DuckDB table "${table}"`);
  return written;
}

// ---------- Databricks ----------

interface DatabricksConfig {
  host: string; // e.g. dbc-xxxx.cloud.databricks.com or adb-xxxx.azuredatabricks.net
  token: string; // personal access token
  warehouse_id: string; // SQL warehouse id
  catalog?: string; // defaults to the warehouse's default catalog
  schema?: string; // defaults to "default"
  table?: string;
}

function databricksBaseUrl(config: DatabricksConfig): string {
  const host = String(config.host).replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return `https://${host}/api/2.0/sql/statements`;
}

async function databricksExec(config: DatabricksConfig, statement: string): Promise<any> {
  const headers = {
    Authorization: `Bearer ${config.token}`,
    'Content-Type': 'application/json'
  };
  const submit = await axios.post(
    databricksBaseUrl(config),
    {
      warehouse_id: config.warehouse_id,
      statement,
      wait_timeout: '30s',
      on_wait_timeout: 'CONTINUE'
    },
    { headers, timeout: 60000 }
  );

  let result = submit.data;
  const deadline = Date.now() + 120000;
  while (['PENDING', 'RUNNING'].includes(result?.status?.state)) {
    if (Date.now() > deadline) {
      throw new Error(`Databricks statement timed out (statement_id: ${result.statement_id})`);
    }
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await axios.get(`${databricksBaseUrl(config)}/${result.statement_id}`, {
      headers,
      timeout: 30000
    });
    result = poll.data;
  }

  if (result?.status?.state !== 'SUCCEEDED') {
    const err = result?.status?.error?.message || `state: ${result?.status?.state}`;
    throw new Error(`Databricks statement failed: ${err}`);
  }
  return result;
}

function databricksTableRef(config: DatabricksConfig, stream: string): string {
  const table = assertIdentifier(String(config.table || `synced_${stream}`), 'table name');
  const schema = assertIdentifier(String(config.schema || 'default'), 'schema name');
  if (config.catalog) {
    const catalog = assertIdentifier(String(config.catalog), 'catalog name');
    return `\`${catalog}\`.\`${schema}\`.\`${table}\``;
  }
  return `\`${schema}\`.\`${table}\``;
}

function sqlStringLiteral(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

async function databricksDestination(
  config: DatabricksConfig,
  records: Record<string, any>[],
  stream: string,
  log: LogFn
): Promise<number> {
  if (!config?.host || !config?.token || !config?.warehouse_id) {
    throw new Error('destination-databricks config requires: host, token, warehouse_id (optional: catalog, schema, table)');
  }
  const tableRef = databricksTableRef(config, stream);

  await databricksExec(
    config,
    `CREATE TABLE IF NOT EXISTS ${tableRef} (data STRING, _synced_at TIMESTAMP) USING DELTA`
  );
  await log('INFO', `Ensured Databricks table ${tableRef} exists`);

  let written = 0;
  const BATCH = 200;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const values = batch
      .map((r) => `(${sqlStringLiteral(JSON.stringify(r))}, current_timestamp())`)
      .join(',\n');
    await databricksExec(config, `INSERT INTO ${tableRef} (data, _synced_at) VALUES\n${values}`);
    written += batch.length;
    await log('INFO', `Databricks: inserted batch of ${batch.length} (${written}/${records.length})`);
  }
  return written;
}

// ---------- Connection testing ----------

export async function testConnection(
  connectorName: string,
  config: any
): Promise<{ success: boolean; message: string }> {
  try {
    assertValidConnectorConfig(connectorName, config);
    switch (connectorName) {
      case 'source-faker':
        return { success: true, message: 'Faker source needs no connection' };
      case 'source-postgres':
      case 'destination-postgres': {
        const client = new Client({
          host: config?.host,
          port: Number(config?.port) || 5432,
          database: config?.database,
          user: config?.user,
          password: config?.password,
          connectionTimeoutMillis: 10000
        });
        await client.connect();
        try {
          await client.query('SELECT 1');
        } finally {
          await client.end().catch(() => {});
        }
        return { success: true, message: `Connected to Postgres at ${config.host}:${config.port || 5432}/${config.database}` };
      }
      case 'source-http': {
        const response = await axios.get(String(config.url), { timeout: 15000 });
        return { success: true, message: `HTTP ${response.status} from ${config.url}` };
      }
      case 'source-csv': {
        const file = exportPath(config.path, config.path);
        if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
        return { success: true, message: `Found ${file}` };
      }
      case 'destination-csv':
      case 'destination-jsonl': {
        fs.mkdirSync(EXPORT_DIR, { recursive: true });
        const probe = path.join(EXPORT_DIR, '.write_test');
        fs.writeFileSync(probe, 'ok');
        fs.unlinkSync(probe);
        return { success: true, message: `Export directory ${EXPORT_DIR} is writable` };
      }
      case 'destination-duckdb': {
        const file = exportPath(config.path, 'warehouse.duckdb');
        const db = getDuckDb(file);
        await duckdbRun(db, 'SELECT 1');
        return { success: true, message: `DuckDB ready at ${file}` };
      }
      case 'destination-databricks': {
        await databricksExec(config, 'SELECT 1');
        return { success: true, message: `Connected to Databricks warehouse ${config.warehouse_id} at ${config.host}` };
      }
      default:
        return { success: false, message: `Connector "${connectorName}" is not implemented yet` };
    }
  } catch (error: any) {
    return { success: false, message: error?.message || 'Connection failed' };
  }
}

// ---------- Dispatch ----------

export async function runSource(connectorName: string, config: any, log: LogFn): Promise<SourceResult> {
  switch (connectorName) {
    case 'source-faker':
      return fakerSource(config);
    case 'source-postgres':
      return postgresSource(config, log);
    case 'source-http':
      return httpSource(config, log);
    case 'source-csv':
      return csvSource(config, log);
    default:
      throw new Error(
        `Source connector "${connectorName}" is not implemented yet. Available: ${implementedConnectors('SOURCE').join(', ')}`
      );
  }
}

export async function runDestination(
  connectorName: string,
  config: any,
  records: Record<string, any>[],
  stream: string,
  log: LogFn
): Promise<number> {
  switch (connectorName) {
    case 'destination-postgres':
      return postgresDestination(config, records, stream, log);
    case 'destination-duckdb':
      return duckdbDestination(config, records, stream, log);
    case 'destination-csv':
      return csvDestination(config, records, stream, log);
    case 'destination-jsonl':
      return jsonlDestination(config, records, stream, log);
    case 'destination-databricks':
      return databricksDestination(config, records, stream, log);
    default:
      throw new Error(
        `Destination connector "${connectorName}" is not implemented yet. Available: ${implementedConnectors('DESTINATION').join(', ')}`
      );
  }
}
