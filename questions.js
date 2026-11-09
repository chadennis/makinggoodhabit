import { sql } from "./_db.js";

const VALID_MODES = ["hanja1", "hanja2", "hanja3", "hist"];

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const mode = String(req.query.mode || "hanja1").trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 30);

    if (!VALID_MODES.includes(mode)) {
      return res.status(400).json({ error: "Invalid mode" });
    }

    // DB에서 무작위로 n문제 가져오기
    const rows = await sql`
      SELECT id, mode, q_type, prompt, glyph, answer, options, explanation
      FROM quiz_questions
      WHERE mode = ${mode}
      ORDER BY RANDOM()
      LIMIT ${limit}
    `;

    return res.status(200).json({ questions: rows });
  } catch (err) {
    console.error("Failed to fetch questions:", err);
    return res.status(500).json({ error: "Failed to fetch questions" });
  }
}
