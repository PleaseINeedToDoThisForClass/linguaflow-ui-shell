import { createFileRoute } from "@tanstack/react-router";
import "@tanstack/react-start";

export const Route = createFileRoute("/api/translate")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          const { text, targetLanguage } = (await request.json()) as {
            text?: string;
            targetLanguage?: string;
          };

          if (!text || !targetLanguage) {
            return Response.json(
              { error: "Missing text or targetLanguage" },
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

          const system = `You are a real-time spoken language interpreter. Translate the user's text into natural, conversational ${targetLanguage} exactly as a fluent native speaker would say it out loud in everyday speech. Avoid formal, written, or overly literal constructions. Never add explanations, notes, alternatives, or punctuation corrections. Return only the translated text and nothing else.`;

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
          const translation = data.choices?.[0]?.message?.content?.trim() ?? "";
          return Response.json({ translation });
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
