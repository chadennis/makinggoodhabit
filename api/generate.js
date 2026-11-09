import { sql, ensureSchema } from "./_db.js";

const VALID_MODES = ["hanja1", "hanja2", "hanja3", "hist", "math_mul", "math_div"];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY가 설정되지 않았습니다. Vercel 환경 변수를 확인해주세요." });
  }

  try {
    await ensureSchema();

    const { mode, topic, targetAge, count = 10 } = req.body || {};
    if (!mode || !VALID_MODES.includes(mode)) {
      return res.status(400).json({ error: "올바른 퀴즈 모드를 선택해주세요." });
    }

    const qCount = Math.min(Math.max(parseInt(count, 10) || 10, 1), 20);

    const systemInstruction = `당신은 초등학생 및 미취학 어린이를 위한 최고의 교육 퀴즈 전문가입니다.
어린이의 눈높이에 맞춰 흥미진진하고 유익한 4지 선다형 퀴즈를 출제합니다.
질문은 친절하고 명확해야 하며, 오답 3개는 어린이가 헷갈릴 수 있는 매력적이고 그럴듯한 보기여야 합니다.
해설(explanation)은 정답인 이유를 1~2문장으로 쉽고 따뜻하게 설명해주세요.`;

    const userPrompt = `
대상 연령: 만 ${targetAge || 8}세 어린이
퀴즈 모드: ${mode}
주제 및 세부 요구사항: ${topic || "재미있는 퀴즈"}
출제 문제 수: ${qCount}문제

[세부 규칙]
1. math_mul (두 자리 곱셈): prompt는 문제를 묻고, glyph에는 수식(예: "24 × 15")을, answer에는 숫자 결과값을 넣으세요.
2. math_div (두 자리 나눗셈): prompt는 문제를 묻고, glyph에는 수식(예: "84 ÷ 6")을, answer에는 정수 몫을 넣으세요.
3. hanja1, hanja2, hanja3 (한자): prompt에 질문을, glyph에 해당 한자(또는 결합 공식)를 넣고, answer에 정답 훈음이나 한자를 넣으세요.
4. hist (세계사/한국사): prompt에 흥미로운 이야기형 질문을 넣고, glyph는 null로 설정하세요.
5. options는 정답(answer)을 제외한 오답 3개의 문자열 배열이어야 합니다.
`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const geminiReqBody = {
      contents: [
        {
          role: "user",
          parts: [{ text: `${systemInstruction}\n\n${userPrompt}` }]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              prompt: { type: "STRING" },
              glyph: { type: "STRING" },
              answer: { type: "STRING" },
              options: {
                type: "ARRAY",
                items: { type: "STRING" },
                description: "정답을 제외한 매력적인 오답 3개"
              },
              explanation: { type: "STRING" }
            },
            required: ["prompt", "answer", "options", "explanation"]
          }
        }
      }
    };

    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiReqBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API Error:", errText);
      return res.status(response.status).json({ error: `Gemini API 호출 실패: ${response.statusText}` });
    }

    const data = await response.json();
    const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawJson) {
      return res.status(500).json({ error: "Gemini로부터 유효한 응답을 받지 못했습니다." });
    }

    const questions = JSON.parse(rawJson);
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(500).json({ error: "생성된 문제가 없습니다." });
    }

    const qType = (mode.startsWith("math") || mode.startsWith("hanja")) ? "glyph" : "history";

    const rows = questions.map(q => ({
      mode,
      q_type: qType,
      prompt: q.prompt,
      glyph: q.glyph || null,
      answer: String(q.answer),
      options: JSON.stringify(q.options.map(o => String(o))),
      explanation: q.explanation || `${q.prompt}의 정답은 ${q.answer}입니다.`
    }));

    await sql`
      INSERT INTO quiz_questions (mode, q_type, prompt, glyph, answer, options, explanation)
      SELECT x.mode, x.q_type, x.prompt, x.glyph, x.answer, x.options::jsonb, x.explanation
      FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
      AS x(mode text, q_type text, prompt text, glyph text, answer text, options text, explanation text)
    `;

    return res.status(200).json({
      success: true,
      count: rows.length,
      mode,
      samplePrompt: rows[0].prompt
    });

  } catch (err) {
    console.error("Generation handler error:", err);
    return res.status(500).json({ error: err.message || "문제 생성 중 서버 오류가 발생했습니다." });
  }
}
