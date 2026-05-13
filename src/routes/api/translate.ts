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

          const apiKey = process.env.ANTHROPIC_API_KEY;
          if (!apiKey) {
            return Response.json(
              { error: "ANTHROPIC_API_KEY not configured" },
              { status: 500 },
            );
          }

          const system = `You are a real-time spoken language interpreter. Translate the user's text into natural, conversational ${targetLanguage} exactly as a fluent native speaker would say it out loud in everyday speech. Avoid formal, written, or overly literal constructions. Never add explanations, notes, alternatives, or punctuation corrections. Return only the translated text and nothing else.`;

          const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model: "claude-sonnet-4-20250514",
              max_tokens: 1024,
              system,
              messages: [{ role: "user", content: text }],
            }),
          });

          if (!res.ok) {
            const errText = await res.text();
            console.error("Anthropic API error:", res.status, errText);
            return Response.json(
              { error: `Anthropic API error: ${res.status}` },
              { status: 502 },
            );
          }

          const data = (await res.json()) as {
            content?: Array<{ text?: string }>;
          };
          const translation = data.content?.[0]?.text ?? "";
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
