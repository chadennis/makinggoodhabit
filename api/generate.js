import { GoogleGenAI, Type } from "@google/genai";
import { sql, ensureSchema } from "./_db.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    await ensureSchema();
    const { mode, topic, targetAge, count = 10 } = req.body;

    const prompt = `
      대상: ${targetAge}세 어린이
      주제: ${topic}
      요청: 아이들의 흥미를 유발할 수 있는 객관식 퀴즈 ${count}문제를 만들어주세요.
      규칙:
      1. 질문(prompt)은 어린이 눈높이에 맞게 친절하고 명확하게 작성하세요.
      2. options는 정답을 제외한 매력적인 오답 3개의 문자열 배열이어야 합니다.
      3. explanation은 정답인 이유를 1~2문장으로 쉽게 설명하세요.
      4. 수식이나 한자가 중심인 경우 glyph에 해당 글자나 수식을 넣고, 일반 질문이면 glyph는 null로 설정하세요.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              prompt: { type: Type.STRING },
              glyph: { type: Type.STRING, nullable: true },
              answer: { type: Type.STRING },
              options: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "정답을 제외한 오답 3개"
              },
              explanation: { type: Type.STRING }
            },
            required: ["prompt", "answer", "options", "explanation"]
          }
        }
      }
    });

    const generatedQuestions = JSON.parse(response.text);

    // Neon DB에 즉시 적재
    const qType = (mode.startsWith("math") || mode.startsWith("hanja")) ? "glyph" : "history";
    const rows = generatedQuestions.map(q => ({
      mode,
      q_type: qType,
      prompt: q.prompt,
      glyph: q.glyph || null,
      answer: q.answer,
      options: JSON.stringify(q.options),
      explanation: q.explanation
    }));

    await sql`
      INSERT INTO quiz_questions (mode, q_type, prompt, glyph, answer, options, explanation)
      SELECT x.mode, x.q_type, x.prompt, x.glyph, x.answer, x.options::jsonb, x.explanation
      FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
      AS x(mode text, q_type text, prompt text, glyph text, answer text, options text, explanation text)
    `;

    return res.status(200).json({ success: true, count: rows.length });
  } catch (err) {
    console.error("Gemini Generation Error:", err);
    return res.status(500).json({ error: err.message });
  }
}
