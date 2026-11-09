-- Neon SQL Editor에서 실행하거나, API가 첫 호출 때 자동으로 만들어 줍니다.
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id         BIGSERIAL PRIMARY KEY,
  player     TEXT        NOT NULL,
  mode       TEXT        NOT NULL,
  score      INTEGER     NOT NULL,
  total      INTEGER     NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS quiz_answers (
  id         BIGSERIAL PRIMARY KEY,
  attempt_id BIGINT  NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  question   TEXT    NOT NULL,
  chosen     TEXT    NOT NULL,
  answer     TEXT    NOT NULL,
  correct    BOOLEAN NOT NULL
);
CREATE INDEX IF NOT EXISTS quiz_attempts_player_idx ON quiz_attempts (player, created_at DESC);
CREATE INDEX IF NOT EXISTS quiz_answers_attempt_idx ON quiz_answers (attempt_id);
