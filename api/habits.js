import { sql, ensureSchema } from "./_db.js";

const cut = (s, n) => String(s ?? "").slice(0, n).trim();

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const player = cut(req.query.player || req.body?.player || "수인", 20);

    // 1. 오늘의 할 일 목록, 열쇠 현황, 최근 7일 통계 조회 (GET)
    if (req.method === "GET") {
      const today = new Date().toISOString().split("T")[0];

      // 할 일 목록과 오늘 완료 여부
      const habits = await sql`
        SELECT h.id, h.title, h.icon,
               COALESCE(l.is_completed, false) AS completed
        FROM habits h
        LEFT JOIN habit_logs l ON l.habit_id = h.id AND l.completed_date = ${today}
        WHERE h.player = ${player} AND h.is_active = true
        ORDER BY h.id ASC
      `;

      // 플레이어 상태(열쇠, 스트릭)
      let [status] = await sql`SELECT keys, streak FROM player_status WHERE player = ${player}`;
      if (!status) {
        [status] = await sql`INSERT INTO player_status (player, keys, streak) VALUES (${player}, 0, 0) RETURNING keys, streak`;
      }

      // 최근 7일간 일자별 완료 퀘스트 개수 통계
      const weeklyStats = await sql`
        SELECT completed_date::text, COUNT(*)::int AS count
        FROM habit_logs
        WHERE player = ${player} AND completed_date >= CURRENT_DATE - INTERVAL '6 days'
        GROUP BY completed_date
        ORDER BY completed_date ASC
      `;

      return res.status(200).json({ habits, status, today, weeklyStats });
    }

    // 2. 새 할 일 등록 (POST action: 'create')
    if (req.method === "POST" && req.body?.action === "create") {
      const title = cut(req.body.title, 50);
      const icon = cut(req.body.icon || "⭐", 10);
      if (!title) return res.status(400).json({ error: "title required" });

      const [newHabit] = await sql`
        INSERT INTO habits (player, title, category, icon)
        VALUES (${player}, ${title}, 'custom', ${icon})
        RETURNING id, title, icon
      `;
      return res.status(201).json({ habit: newHabit });
    }

    // 3. 완료 체크 토글 (POST action: 'toggle')
    if (req.method === "POST" && req.body?.action === "toggle") {
      const habitId = Number(req.body.habit_id);
      const today = new Date().toISOString().split("T")[0];

      const [existing] = await sql`
        SELECT is_completed FROM habit_logs 
        WHERE habit_id = ${habitId} AND completed_date = ${today}
      `;

      if (existing) {
        await sql`DELETE FROM habit_logs WHERE habit_id = ${habitId} AND completed_date = ${today}`;
        await sql`UPDATE player_status SET keys = GREATEST(0, keys - 1) WHERE player = ${player}`;
        return res.status(200).json({ completed: false, keyChange: -1 });
      } else {
        await sql`
          INSERT INTO habit_logs (habit_id, player, completed_date, is_completed)
          VALUES (${habitId}, ${player}, ${today}, true)
        `;
        await sql`UPDATE player_status SET keys = keys + 1 WHERE player = ${player}`;
        return res.status(200).json({ completed: true, keyChange: 1 });
      }
    }

    // 4. 퀴즈 시작 시 열쇠 소모 (POST action: 'use_key')
    if (req.method === "POST" && req.body?.action === "use_key") {
      const [status] = await sql`SELECT keys FROM player_status WHERE player = ${player}`;
      if (!status || status.keys < 1) {
        return res.status(400).json({ error: "열쇠가 부족해요! 오늘의 할 일을 완료해 주세요." });
      }
      const [updated] = await sql`
        UPDATE player_status SET keys = keys - 1 WHERE player = ${player} RETURNING keys
      `;
      return res.status(200).json({ success: true, remainingKeys: updated.keys });
    }

    // 5. 할 일 삭제 (DELETE)
    if (req.method === "DELETE") {
      const habitId = Number(req.query.id);
      await sql`UPDATE habits SET is_active = false WHERE id = ${habitId} AND player = ${player}`;
      return res.status(200).json({ success: true });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Habit API Error:", err);
    return res.status(500).json({ error: "server error" });
  }
}
