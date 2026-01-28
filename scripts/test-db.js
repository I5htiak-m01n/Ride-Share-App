require("dotenv").config();
const { Client } = require("pg");

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("Missing DATABASE_URL in .env");
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    // Many cloud Postgres providers require SSL; if your URL already has sslmode=require,
    // this usually works without extra config.
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  const res = await client.query("SELECT now() as server_time;");
  console.log(res.rows[0]);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
