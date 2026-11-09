import { neon } from "@neondatabase/serverless";

export const sql = neon(process.env.DATABASE_URL);

let ready;
// 테이블이 없으면 처음 한 번 만들어 줍니다.
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
    await sql`CREATE INDEX IF NOT EXISTS quiz_attempts_player_idx ON quiz_attempts (player, created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS quiz_answers_attempt_idx ON quiz_answers (attempt_id)`;
  })());
}
