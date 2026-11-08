// Creates the database if missing, then applies Drizzle SQL migrations from ./drizzle.
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env and fill it in.');
  process.exit(1);
}
const parsed = new URL(url);
const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
if (!/^[A-Za-z0-9_]+$/.test(dbName)) {
  console.error(`Refusing to create database with unusual name: "${dbName}"`);
  process.exit(1);
}
const serverUrl = new URL(url);
serverUrl.pathname = '/';

const admin = await mysql.createConnection(serverUrl.toString());
await admin.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
await admin.end();

const conn = await mysql.createConnection(url);
await conn.query("SET time_zone = '+00:00'");
await migrate(drizzle(conn), { migrationsFolder: './drizzle' });
await conn.end();
console.log(`Migrations applied to "${dbName}".`);
