import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_CHARS = 45000;

const questionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    prompt: { type: "string" },
    options: { type: "array", items: { type: "string" } },
    correct_index: { type: "integer" },
    explanation: { type: "string" },
  },
  required: ["prompt", "options", "correct_index", "explanation"],
};

const journeySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    lesson_title: { type: "string" },
    sprints: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          objectives: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                title: { type: "string" },
                body: { type: "string" },
                questions: { type: "array", items: questionSchema },
              },
              required: ["title", "body", "questions"],
            },
          },
        },
        required: ["title", "summary", "objectives"],
      },
    },
  },
  required: ["lesson_title", "sprints"],
};

const examSchema = {
  type: "object",
  additionalProperties: false,
  properties: { questions: { type: "array", items: questionSchema } },
  required: ["questions"],
};

type JourneyResult = {
  lesson_title: string;
  sprints: {
    title: string;
    summary: string;
    objectives: {
      title: string;
      body: string;
      questions: {
        prompt: string;
        options: string[];
        correct_index: number;
        explanation: string;
      }[];
    }[];
  }[];
};

type ExamResult = {
  questions: {
    prompt: string;
    options: string[];
    correct_index: number;
    explanation: string;
  }[];
};

function sanitizeQuestion(q: {
  prompt: string;
  options: string[];
  correct_index: number;
  explanation: string;
}) {
  const options = (q.options ?? []).filter((o) => typeof o === "string" && o.trim()).slice(0, 4);
  while (options.length < 4) options.push("None of the above");
  const correct = Math.min(Math.max(q.correct_index ?? 0, 0), options.length - 1);
  return {
    prompt: q.prompt,
    options,
    correct_index: correct,
    explanation: q.explanation ?? "",
  };
}

/** Reads the lesson text and builds sprints, objectives and 2 MCQs per objective. */
export const buildJourney = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { lessonId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { generateJson } = await import("./ai.server");

    const { data: lesson, error } = await supabase
      .from("lessons")
      .select("id, title, content")
      .eq("id", data.lessonId)
      .single();
    if (error || !lesson) throw new Error("Lesson not found.");
    if (!lesson.content || lesson.content.trim().length < 200) {
      throw new Error(
        "We couldn't read enough text from that PDF. It may be a scanned image rather than text.",
      );
    }

    await supabase.from("lessons").update({ status: "building" }).eq("id", lesson.id);

    try {
      const result = await generateJson<JourneyResult>({
        schemaName: "study_journey",
        schema: journeySchema,
        instructions: [
          "You are a study planner. You read a lesson and turn it into a gated study journey.",
          "Find the MAIN TITLES of the lesson: each main title becomes one sprint (aim for 3 to 8 sprints).",
          "Under each sprint, find the SUBTITLES: each subtitle becomes one learning objective (1 to 5 per sprint).",
          "For every objective write exactly 2 multiple-choice questions with exactly 4 options each,",
          "the zero-based index of the single correct option, and a one-sentence explanation.",
          "Questions must be answerable from the lesson text only. Keep the lesson's own language.",
          "Keep 'body' to a short 1-2 sentence description of what the objective covers.",
        ].join(" "),
        input: `LESSON TITLE: ${lesson.title}\n\nLESSON TEXT:\n${lesson.content.slice(0, MAX_CHARS)}`,
      });

      const sprints = (result.sprints ?? []).filter((s) => s.objectives?.length);
      if (!sprints.length) throw new Error("The AI could not find any sections in this lesson.");

      // clear any previous attempt
      await supabase.from("sprints").delete().eq("lesson_id", lesson.id);
      await supabase.from("questions").delete().eq("lesson_id", lesson.id);

      for (let s = 0; s < sprints.length; s++) {
        const sprint = sprints[s]!;
        const { data: sprintRow, error: sErr } = await supabase
          .from("sprints")
          .insert({
            lesson_id: lesson.id,
            user_id: userId,
            position: s,
            title: sprint.title,
            summary: sprint.summary ?? "",
          })
          .select("id")
          .single();
        if (sErr || !sprintRow) throw new Error(sErr?.message ?? "Could not save a sprint.");

        for (let o = 0; o < sprint.objectives.length; o++) {
          const objective = sprint.objectives[o]!;
          const { data: objRow, error: oErr } = await supabase
            .from("objectives")
            .insert({
              sprint_id: sprintRow.id,
              lesson_id: lesson.id,
              user_id: userId,
              position: o,
              title: objective.title,
              body: objective.body ?? "",
            })
            .select("id")
            .single();
          if (oErr || !objRow) throw new Error(oErr?.message ?? "Could not save an objective.");

          const questions = (objective.questions ?? []).slice(0, 2).map((q, i) => ({
            ...sanitizeQuestion(q),
            lesson_id: lesson.id,
            objective_id: objRow.id,
            user_id: userId,
            position: i,
          }));
          if (questions.length) {
            const { error: qErr } = await supabase.from("questions").insert(questions);
            if (qErr) throw new Error(qErr.message);
          }
        }
      }

      await supabase
        .from("lessons")
        .update({ status: "ready", title: result.lesson_title || lesson.title })
        .eq("id", lesson.id);

      return { ok: true, sprints: sprints.length };
    } catch (e) {
      await supabase.from("lessons").update({ status: "failed" }).eq("id", lesson.id);
      throw e;
    }
  });

/** Builds the final exam covering every sprint of the lesson. */
export const buildFinalExam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { lessonId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { generateJson } = await import("./ai.server");

    const { data: lesson } = await supabase
      .from("lessons")
      .select("id, title, content")
      .eq("id", data.lessonId)
      .single();
    if (!lesson) throw new Error("Lesson not found.");

    const { data: existing } = await supabase
      .from("questions")
      .select("id")
      .eq("lesson_id", lesson.id)
      .eq("is_final", true);
    if (existing && existing.length > 0) return { ok: true, created: 0 };

    const { data: objectives } = await supabase
      .from("objectives")
      .select("title")
      .eq("lesson_id", lesson.id);

    const result = await generateJson<ExamResult>({
      schemaName: "final_exam",
      schema: examSchema,
      instructions: [
        "You write a final exam for a lesson. Produce 10 multiple-choice questions that cover",
        "all of the listed objectives evenly. Each question has exactly 4 options, the zero-based",
        "index of the single correct option, and a one-sentence explanation.",
        "Questions must be answerable from the lesson text only.",
      ].join(" "),
      input: `LESSON TITLE: ${lesson.title}\n\nOBJECTIVES:\n${(objectives ?? [])
        .map((o) => `- ${o.title}`)
        .join("\n")}\n\nLESSON TEXT:\n${(lesson.content ?? "").slice(0, MAX_CHARS)}`,
    });

    const rows = (result.questions ?? []).slice(0, 10).map((q, i) => ({
      ...sanitizeQuestion(q),
      lesson_id: lesson.id,
      objective_id: null,
      user_id: userId,
      position: i,
      is_final: true,
    }));
    if (!rows.length) throw new Error("The AI could not build the final exam. Please try again.");

    const { error } = await supabase.from("questions").insert(rows);
    if (error) throw new Error(error.message);
    return { ok: true, created: rows.length };
  });
