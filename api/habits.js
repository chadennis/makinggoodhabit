import { sql, ensureSchema } from "./_db.js";

const cut = (s, n) => String(s ?? "").slice(0, n).trim();
const DAILY_KEY_LIMIT = 5;

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const player = cut(req.query.player || req.body?.player || "수인", 20);
    const today = new Date().toISOString().split("T")[0];

    // 1. 오늘의 상태, 할 일, 주간 통계, 보유 쿠폰 조회 (GET)
    if (req.method === "GET") {
      let [status] = await sql`
        SELECT keys, streak, daily_keys_earned, last_key_date::text 
        FROM player_status WHERE player = ${player}
      `;

      if (!status) {
        [status] = await sql`
          INSERT INTO player_status (player, keys, streak, daily_keys_earned, last_key_date) 
          VALUES (${player}, 0, 0, 0, ${today}) 
          RETURNING keys, streak, daily_keys_earned, last_key_date::text
        `;
      } else if (status.last_key_date !== today) {
        [status] = await sql`
          UPDATE player_status 
          SET daily_keys_earned = 0, last_key_date = ${today} 
          WHERE player = ${player} 
          RETURNING keys, streak, daily_keys_earned, last_key_date::text
        `;
      }

      const habits = await sql`
        SELECT h.id, h.title, h.icon,
               COALESCE(l.is_completed, false) AS completed
        FROM habits h
        LEFT JOIN habit_logs l ON l.habit_id = h.id AND l.completed_date = ${today}
        WHERE h.player = ${player} AND h.is_active = true
        ORDER BY h.id ASC
      `;

      const weeklyStats = await sql`
        SELECT completed_date::text, COUNT(*)::int AS count
        FROM habit_logs
        WHERE player = ${player} AND completed_date >= CURRENT_DATE - INTERVAL '6 days'
        GROUP BY completed_date
        ORDER BY completed_date ASC
      `;

      const coupons = await sql`
        SELECT id, title, icon, cost, created_at
        FROM reward_coupons
        WHERE player = ${player} AND is_used = false
        ORDER BY id DESC
      `;

      return res.status(200).json({
        habits,
        status: {
          keys: status.keys,
          streak: status.streak,
          daily_keys_earned: status.daily_keys_earned,
          daily_limit: DAILY_KEY_LIMIT
        },
        coupons,
        weeklyStats,
        today
      });
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

      const [existing] = await sql`
        SELECT is_completed FROM habit_logs 
        WHERE habit_id = ${habitId} AND completed_date = ${today}
      `;

      let [status] = await sql`SELECT keys, daily_keys_earned, last_key_date::text FROM player_status WHERE player = ${player}`;
      if (!status || status.last_key_date !== today) {
        [status] = await sql`
          UPDATE player_status 
          SET daily_keys_earned = 0, last_key_date = ${today} 
          WHERE player = ${player} 
          RETURNING keys, daily_keys_earned, last_key_date::text
        `;
      }

      if (existing) {
        await sql`DELETE FROM habit_logs WHERE habit_id = ${habitId} AND completed_date = ${today}`;
        const [updated] = await sql`
          UPDATE player_status 
          SET keys = GREATEST(0, keys - 1), daily_keys_earned = GREATEST(0, daily_keys_earned - 1)
          WHERE player = ${player}
          RETURNING keys, daily_keys_earned
        `;
        return res.status(200).json({ completed: false, keyChange: -1, status: updated });
      } else {
        await sql`
          INSERT INTO habit_logs (habit_id, player, completed_date, is_completed)
          VALUES (${habitId}, ${player}, ${today}, true)
        `;

        if (status.daily_keys_earned < DAILY_KEY_LIMIT) {
          const [updated] = await sql`
            UPDATE player_status 
            SET keys = keys + 1, daily_keys_earned = daily_keys_earned + 1
            WHERE player = ${player}
            RETURNING keys, daily_keys_earned
          `;
          return res.status(200).json({ completed: true, keyChange: 1, status: updated });
        } else {
          return res.status(200).json({ completed: true, keyChange: 0, status, limitReached: true });
        }
      }
    }

    // 4. 상점 아이템 구매 (POST action: 'buy_reward')
    if (req.method === "POST" && req.body?.action === "buy_reward") {
      const title = cut(req.body.title, 50);
      const icon = cut(req.body.icon || "🎁", 10);
      const cost = Number(req.body.cost) || 1;

      let [status] = await sql`SELECT keys FROM player_status WHERE player = ${player}`;
      if (!status || status.keys < cost) {
        return res.status(400).json({ error: "열쇠가 부족해요! 더 모아서 교환해 보세요." });
      }

      const [updated] = await sql`
        UPDATE player_status SET keys = keys - ${cost} WHERE player = ${player} RETURNING keys
      `;

      const [coupon] = await sql`
        INSERT INTO reward_coupons (player, title, icon, cost)
        VALUES (${player}, ${title}, ${icon}, ${cost})
        RETURNING id, title, icon, cost, created_at
      `;

      return res.status(200).json({ success: true, coupon, remainingKeys: updated.keys });
    }

    // 5. 쿠폰 사용하기 (POST action: 'use_coupon')
    if (req.method === "POST" && req.body?.action === "use_coupon") {
      const couponId = Number(req.body.coupon_id);
      await sql`
        UPDATE reward_coupons 
        SET is_used = true, used_at = now() 
        WHERE id = ${couponId} AND player = ${player}
      `;
      return res.status(200).json({ success: true });
    }

    // 6. 할 일 삭제 (DELETE)
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
