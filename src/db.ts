import { Installation } from '@slack/bolt';
import { Client } from 'pg';

process.env.PGSSLMODE = 'require';

const parsed = new URL(process.env.DATABASE_URL!);

const TABLE_NAME = 'app_installs';

export const client = new Client({
  user: parsed.username,
  password: parsed.password,
  host: parsed.hostname,
  port: parseInt(parsed.port, 10),
  database: parsed.pathname.slice(1),
  ssl: {
    rejectUnauthorized: false,
  },
});

async function createTableSchema() {
  await client.query(`CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
    team_id varchar(40) NOT NULL,
    enterprise_id varchar(40) NOT NULL,
    installation_blob json NOT NULL,
    PRIMARY KEY(team_id, enterprise_id)
  )`);
}

const once = (fn: () => Promise<void>) => {
  let singleton: Promise<void> | null = null;

  return async () => {
    if (!singleton) {
      singleton = fn();
    }

    return await singleton;
  };
};

const ensureDBInitialized = once(async function () {
  await client.connect();
  await createTableSchema();
});

export async function getInstallation(teamId: string | null, enterpriseId: string | null) {
  await ensureDBInitialized();
  const result = await client.query(
    `SELECT * FROM ${TABLE_NAME} WHERE team_id = $1 AND enterprise_id = $2`,
    [teamId || '', enterpriseId || ''],
  );
  if (result.rows.length !== 1) return null;
  const value = result.rows[0].installation_blob;
  return value as Installation;
}

export async function storeInstallation(install: Installation) {
  await ensureDBInitialized();
  await client.query(
    `INSERT INTO ${TABLE_NAME} (team_id, enterprise_id, installation_blob) VALUES ($1, $2, $3) ON CONFLICT (team_id, enterprise_id) DO UPDATE SET installation_blob = $4`,
    [install.team?.id || '', install.enterprise?.id || '', install, install],
  );
}
