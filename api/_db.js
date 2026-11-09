import { neon } from "@neondatabase/serverless";

export const sql = neon(process.env.DATABASE_URL);

let ready;
export function ensureSchema() {
  return (ready ??= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS quiz_attempts (
      id BIGSERIAL PRIMARY KEY, player TEXT NOT NULL, mode TEXT NOT NULL,
      score INTEGER NOT NULL, total INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
    await sql`CREATE TABLE IF NOT EXISTS quiz_answers (
      id BIGSERIAL PRIMARY KEY,
      attempt_id BIGINT NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
      question TEXT NOT NULL, chosen TEXT NOT NULL, answer TEXT NOT NULL,
      correct BOOLEAN NOT NULL)`;
    await sql`CREATE TABLE IF NOT EXISTS quiz_questions (
      id BIGSERIAL PRIMARY KEY,
      mode TEXT NOT NULL,
      q_type TEXT NOT NULL DEFAULT 'text',
      prompt TEXT NOT NULL,
      glyph TEXT,
      answer TEXT NOT NULL,
      options JSONB NOT NULL,
      explanation TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
    await sql`CREATE TABLE IF NOT EXISTS habits (
      id BIGSERIAL PRIMARY KEY,
      player TEXT NOT NULL DEFAULT '수인',
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT '📝',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
    await sql`CREATE TABLE IF NOT EXISTS habit_logs (
      id BIGSERIAL PRIMARY KEY,
      habit_id BIGINT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
      player TEXT NOT NULL,
      completed_date DATE NOT NULL DEFAULT CURRENT_DATE,
      is_completed BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(habit_id, completed_date))`;
    await sql`CREATE TABLE IF NOT EXISTS player_status (
      player TEXT PRIMARY KEY,
      keys INTEGER NOT NULL DEFAULT 0,
      streak INTEGER NOT NULL DEFAULT 0,
      daily_keys_earned INTEGER NOT NULL DEFAULT 0,
      last_key_date DATE DEFAULT CURRENT_DATE)`;
    await sql`ALTER TABLE player_status ADD COLUMN IF NOT EXISTS daily_keys_earned INTEGER NOT NULL DEFAULT 0`;
    await sql`ALTER TABLE player_status ADD COLUMN IF NOT EXISTS last_key_date DATE DEFAULT CURRENT_DATE`;
    await sql`CREATE TABLE IF NOT EXISTS reward_coupons (
      id BIGSERIAL PRIMARY KEY,
      player TEXT NOT NULL,
      title TEXT NOT NULL,
      icon TEXT NOT NULL,
      cost INTEGER NOT NULL,
      is_used BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      used_at TIMESTAMPTZ)`;
  })());
}
