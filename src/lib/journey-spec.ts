/** Shared AI schema + prompt for turning a lesson into a study journey. */

export const questionSchema = {
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

export const journeySchema = {
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

export const examSchema = {
  type: "object",
  additionalProperties: false,
  properties: { questions: { type: "array", items: questionSchema } },
  required: ["questions"],
};

export const journeyInstructions = [
  "You are a study planner. You read a lesson and turn it into a gated study journey.",
  "Find the MAIN TITLES of the lesson: each main title becomes one sprint (aim for 3 to 8 sprints).",
  "Under each sprint, find the SUBTITLES: each subtitle becomes one learning objective (1 to 5 per sprint).",
  "For every objective write exactly 2 multiple-choice questions with exactly 4 options each,",
  "the zero-based index of the single correct option, and a one-sentence explanation.",
  "Questions must be answerable from the lesson text only. Keep the lesson's own language.",
  "Keep 'body' to a short 1-2 sentence description of what the objective covers.",
].join(" ");

export const examInstructions = [
  "You write a final exam for a lesson. Produce 10 multiple-choice questions that cover",
  "all of the listed objectives evenly. Each question has exactly 4 options, the zero-based",
  "index of the single correct option, and a one-sentence explanation.",
  "Questions must be answerable from the lesson text only.",
].join(" ");
