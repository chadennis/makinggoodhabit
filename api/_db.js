import { neon } from "@neondatabase/serverless";

export const sql = neon(process.env.DATABASE_URL);

let ready;
export function ensureSchema() {
  return (ready ??= (async () => {
    // 1. 퀴즈 시도 기록 테이블
    await sql`CREATE TABLE IF NOT EXISTS quiz_attempts (
      id BIGSERIAL PRIMARY KEY, player TEXT NOT NULL, mode TEXT NOT NULL,
      score INTEGER NOT NULL, total INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;

    // 2. 문제별 정오답 기록 테이블
    await sql`CREATE TABLE IF NOT EXISTS quiz_answers (
      id BIGSERIAL PRIMARY KEY,
      attempt_id BIGINT NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
      question TEXT NOT NULL, chosen TEXT NOT NULL, answer TEXT NOT NULL,
      correct BOOLEAN NOT NULL)`;

    // 3. 문제 저장소 테이블 (신규)
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

    await sql`CREATE INDEX IF NOT EXISTS quiz_attempts_player_idx ON quiz_attempts (player, created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS quiz_answers_attempt_idx ON quiz_answers (attempt_id)`;
    await sql`CREATE INDEX IF NOT EXISTS quiz_questions_mode_idx ON quiz_questions (mode)`;
  })());
}
