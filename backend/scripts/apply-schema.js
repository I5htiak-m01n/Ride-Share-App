require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const DB_DIR = path.join(__dirname, "..", "..", "db");

// --init flag: include schema.sql (DESTRUCTIVE — drops all tables!)
const isInit = process.argv.includes("--init");

// Idempotent files — safe to re-run anytime
const UPDATE_FILES = [
  "functions.sql",
  "views.sql",
  "triggers.sql",
  "procedures.sql",
];

// schema.sql does DROP SCHEMA public CASCADE — only for first-time setup
const INIT_FILES = ["schema.sql", ...UPDATE_FILES];

const filesToApply = isInit ? INIT_FILES : UPDATE_FILES;

async function main() {
  if (isInit) {
    console.log("⚠️  --init mode: this will DROP and recreate all tables!\n");
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  for (const file of filesToApply) {
    const filePath = path.join(DB_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.log(`⏭  Skipping db/${file} (not found)`);
      continue;
    }
    const sql = fs.readFileSync(filePath, "utf8");
    await client.query(sql);
    console.log(`✅ Applied db/${file}`);
  }

  await client.end();
  console.log("\n🎉 All SQL files applied successfully.");
}

main().catch((e) => {
  console.error("❌ Failed:", e);
  process.exit(1);
});