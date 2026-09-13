import axios from 'axios';
import { Client } from 'pg';

type LogFn = (level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR', message: string) => Promise<void> | void;

export interface SourceResult {
  stream: string;
  records: Record<string, any>[];
}

const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function assertIdentifier(name: string, what: string): string {
  if (!IDENTIFIER.test(name)) {
    throw new Error(`Invalid ${what}: "${name}" (letters, digits and underscores only)`);
  }
  return name;
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
      case 'destination-databricks': {
        if (!config?.host || !config?.token || !config?.warehouse_id) {
          throw new Error('config requires: host, token, warehouse_id');
        }
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
    default:
      throw new Error(
        `Source connector "${connectorName}" is not implemented yet. Available: source-faker, source-postgres`
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
    case 'destination-databricks':
      return databricksDestination(config, records, stream, log);
    default:
      throw new Error(
        `Destination connector "${connectorName}" is not implemented yet. Available: destination-postgres, destination-databricks`
      );
  }
}
