import { createFileRoute } from "@tanstack/react-router";
import "@tanstack/react-start";

export const Route = createFileRoute("/api/translate")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          const { text, languageA, languageB } = (await request.json()) as {
            text?: string;
            languageA?: string;
            languageB?: string;
          };

          if (!text || !languageA || !languageB) {
            return Response.json(
              { error: "Missing text, languageA, or languageB" },
              { status: 400 },
            );
          }

          const apiKey = process.env.LOVABLE_API_KEY;
          if (!apiKey) {
            return Response.json(
              { error: "LOVABLE_API_KEY not configured" },
              { status: 500 },
            );
          }

          const system = `You are a real-time bilingual interpreter between ${languageA} and ${languageB}.

Your job, for every input:
1. Detect whether the input text is in ${languageA} or ${languageB}. Use linguistic cues; ignore minor transcription noise (mis-spelled words, missing accents, missing punctuation, capitalization).
2. Translate the input into the OTHER of those two languages.
3. The translation must sound like how a real native speaker would actually say it OUT LOUD in casual everyday conversation. Use the most common, natural phrasing — contractions, colloquial connectors, conversational rhythm. Avoid stiff, formal, textbook, or overly literal renderings. Match the speaker's tone (casual stays casual, polite stays polite).
4. Output ONLY valid JSON in this exact shape, with no prose, code fences, or commentary before or after:
{"sourceLanguage":"${languageA}" | "${languageB}","translation":"..."}

The "translation" field contains only the translated sentence(s) — no quotes around it inside the JSON value beyond what JSON requires, no notes, no alternatives, no explanations.`;

          const res = await fetch(
            "https://ai.gateway.lovable.dev/v1/chat/completions",
            {
              method: "POST",
              headers: {
                "Lovable-API-Key": apiKey,
                "content-type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-3-flash-preview",
                max_tokens: 1024,
                response_format: { type: "json_object" },
                messages: [
                  { role: "system", content: system },
                  { role: "user", content: text },
                ],
              }),
            },
          );

          if (!res.ok) {
            const errText = await res.text();
            console.error("Lovable AI error:", res.status, errText);
            if (res.status === 429) {
              return Response.json(
                { error: "Rate limit exceeded. Please try again shortly." },
                { status: 429 },
              );
            }
            if (res.status === 402) {
              return Response.json(
                { error: "AI credits exhausted. Add credits in workspace settings." },
                { status: 402 },
              );
            }
            return Response.json(
              { error: `AI gateway error: ${res.status}` },
              { status: 502 },
            );
          }

          const data = (await res.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const raw = data.choices?.[0]?.message?.content?.trim() ?? "";

          let sourceLanguage = languageA;
          let translation = "";
          try {
            // Strip any accidental code fences
            const cleaned = raw
              .replace(/^```(?:json)?\s*/i, "")
              .replace(/\s*```$/i, "")
              .trim();
            const parsed = JSON.parse(cleaned) as {
              sourceLanguage?: string;
              translation?: string;
            };
            if (
              parsed.sourceLanguage === languageA ||
              parsed.sourceLanguage === languageB
            ) {
              sourceLanguage = parsed.sourceLanguage;
            }
            translation = (parsed.translation ?? "").trim();
          } catch {
            // Fallback: treat raw as translation
            translation = raw;
          }

          const targetLanguage =
            sourceLanguage === languageA ? languageB : languageA;

          return Response.json({ sourceLanguage, targetLanguage, translation });
        } catch (err) {
          console.error("Translate handler error:", err);
          return Response.json(
            { error: "Translation failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});
