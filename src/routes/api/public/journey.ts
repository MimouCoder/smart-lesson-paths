import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { journeySchema, journeyInstructions, examSchema, examInstructions } from "@/lib/journey-spec";
import { renderJourneyText, type TextQuestion } from "@/lib/journey-text";

const MAX_CHARS = 45000;

const bodySchema = z.object({
  title: z.string().min(1).max(300).optional(),
  text: z.string().min(200).max(200000),
  final_test: z.boolean().optional(),
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-api-key",
};

type JourneyResult = {
  lesson_title: string;
  sprints: {
    title: string;
    summary: string;
    objectives: { title: string; body: string; questions: TextQuestion[] }[];
  }[];
};

function sanitize(q: TextQuestion): TextQuestion {
  const options = (q.options ?? []).filter((o) => typeof o === "string" && o.trim()).slice(0, 4);
  while (options.length < 4) options.push("None of the above");
  return {
    prompt: q.prompt,
    options,
    correct_index: Math.min(Math.max(q.correct_index ?? 0, 0), options.length - 1),
    explanation: q.explanation ?? "",
  };
}

export const Route = createFileRoute("/api/public/journey")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        const expected = process.env["JOURNEY_API_KEY"];
        if (!expected) {
          return new Response("API key is not configured.", { status: 503, headers: cors });
        }
        const provided =
          request.headers.get("x-api-key") ??
          (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (provided !== expected) {
          return new Response("Invalid API key.", { status: 401, headers: cors });
        }

        let parsed;
        const contentType = request.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          const json = await request.json().catch(() => null);
          const result = bodySchema.safeParse(json);
          if (!result.success) {
            return new Response("Send JSON: { text: string (min 200 chars), title?: string }", {
              status: 400,
              headers: cors,
            });
          }
          parsed = result.data;
        } else {
          const raw = await request.text();
          if (raw.trim().length < 200) {
            return new Response("Send at least 200 characters of lesson text.", {
              status: 400,
              headers: cors,
            });
          }
          parsed = { text: raw, title: undefined, final_test: true };
        }

        const { generateJson } = await import("@/lib/ai.server");
        const lessonText = parsed.text.slice(0, MAX_CHARS);
        const title = parsed.title ?? "Lesson";

        try {
          const journey = await generateJson<JourneyResult>({
            schemaName: "study_journey",
            schema: journeySchema,
            instructions: journeyInstructions,
            input: `LESSON TITLE: ${title}\n\nLESSON TEXT:\n${lessonText}`,
          });

          const sprints = (journey.sprints ?? [])
            .filter((s) => s.objectives?.length)
            .map((s) => ({
              title: s.title,
              summary: s.summary,
              objectives: s.objectives.map((o) => ({
                title: o.title,
                body: o.body,
                questions: (o.questions ?? []).slice(0, 2).map(sanitize),
              })),
            }));

          if (!sprints.length) {
            return new Response("No sections could be found in this lesson.", {
              status: 422,
              headers: cors,
            });
          }

          let finalQuestions: TextQuestion[] | undefined;
          if (parsed.final_test !== false) {
            const objectiveTitles = sprints
              .flatMap((s) => s.objectives.map((o) => `- ${o.title}`))
              .join("\n");
            const exam = await generateJson<{ questions: TextQuestion[] }>({
              schemaName: "final_exam",
              schema: examSchema,
              instructions: examInstructions,
              input: `LESSON TITLE: ${journey.lesson_title || title}\n\nOBJECTIVES:\n${objectiveTitles}\n\nLESSON TEXT:\n${lessonText}`,
            });
            finalQuestions = (exam.questions ?? []).slice(0, 10).map(sanitize);
          }

          const text = renderJourneyText({
            lessonTitle: journey.lesson_title || title,
            sprints,
            ...(finalQuestions ? { finalQuestions } : {}),
          });

          return new Response(text, {
            status: 200,
            headers: {
              ...cors,
              "Content-Type": "text/plain; charset=utf-8",
              "Content-Disposition": 'attachment; filename="study-journey.txt"',
            },
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Could not build the journey.";
          return new Response(message, { status: 502, headers: cors });
        }
      },
    },
  },
});
