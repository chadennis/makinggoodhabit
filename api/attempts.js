import { sql, ensureSchema } from "./_db.js";

const MODES = ["hanja1", "hanja2", "hanja3", "hist", "math_mul", "math_div"];
const cut = (s, n) => String(s ?? "").slice(0, n);
const DAILY_KEY_LIMIT = 5;

export default async function handler(req, res) {
  try {
    await ensureSchema();

    if (req.method === "POST") {
      const b = req.body || {};
      const player = cut(b.player, 20).trim();
      const score = Number(b.score), total = Number(b.total);
      if (!player || !MODES.includes(b.mode) || !Number.isInteger(score) || !Number.isInteger(total) ||
          total < 1 || total > 50 || score < 0 || score > total * 20 || !Array.isArray(b.answers) || b.answers.length > 50) {
        return res.status(400).json({ error: "invalid input" });
      }
      const answers = b.answers.map(a => ({
        question: cut(a.q, 200), chosen: cut(a.chosen, 100), answer: cut(a.answer, 100), correct: !!a.correct
      }));
      const [row] = await sql`INSERT INTO quiz_attempts (player, mode, score, total)
        VALUES (${player}, ${b.mode}, ${score}, ${total}) RETURNING id`;
      await sql`INSERT INTO quiz_answers (attempt_id, question, chosen, answer, correct)
        SELECT ${row.id}, x.question, x.chosen, x.answer, x.correct
        FROM jsonb_to_recordset(${JSON.stringify(answers)}::jsonb)
        AS x(question text, chosen text, answer text, correct boolean)`;

      // 퀴즈 70점 이상 달성 시 열쇠 1개 지급 (일일 5개 한도 체크)
      let keyEarned = false;
      const passScore = (total * 10) * 0.7; // 10문제 기준 70점
      if (score >= passScore) {
        const today = new Date().toISOString().split("T")[0];
        let [st] = await sql`SELECT keys, daily_keys_earned, last_key_date::text FROM player_status WHERE player = ${player}`;
        if (!st) {
          await sql`INSERT INTO player_status (player, keys, streak, daily_keys_earned, last_key_date) VALUES (${player}, 1, 0, 1, ${today})`;
          keyEarned = true;
        } else {
          const earned = st.last_key_date === today ? (st.daily_keys_earned || 0) : 0;
          if (earned < DAILY_KEY_LIMIT) {
            await sql`UPDATE player_status SET keys = keys + 1, daily_keys_earned = ${earned + 1}, last_key_date = ${today} WHERE player = ${player}`;
            keyEarned = true;
          }
        }
      }

      return res.status(201).json({ id: row.id, keyEarned });
    }

    if (req.method === "GET") {
      const player = cut(req.query.player, 20).trim();
      if (!player) return res.status(400).json({ error: "player required" });
      const recent = await sql`SELECT id, mode, score, total, created_at FROM quiz_attempts
        WHERE player = ${player} ORDER BY created_at DESC LIMIT 20`;
      const wrong = await sql`SELECT a.question, a.answer, COUNT(*)::int AS misses
        FROM quiz_answers a JOIN quiz_attempts t ON t.id = a.attempt_id
        WHERE t.player = ${player} AND NOT a.correct
        GROUP BY a.question, a.answer ORDER BY misses DESC, a.question LIMIT 20`;
      return res.status(200).json({ recent, wrong });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "server error" });
  }
}
