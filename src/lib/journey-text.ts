/** Pure helpers to render a study journey as plain text. Safe on client and server. */

export type TextQuestion = {
  prompt: string;
  options: string[];
  correct_index: number;
  explanation: string;
};

export type TextObjective = {
  title: string;
  body?: string;
  completed?: boolean;
  questions: TextQuestion[];
};

export type TextSprint = {
  title: string;
  summary?: string;
  objectives: TextObjective[];
};

export type TextJourney = {
  lessonTitle: string;
  sprints: TextSprint[];
  finalQuestions?: TextQuestion[];
  finalScore?: number | null;
  objectivesDone?: number;
  objectivesTotal?: number;
};

const LINE = "=".repeat(60);

function renderQuestions(questions: TextQuestion[], indent: string): string[] {
  const out: string[] = [];
  questions.forEach((q, i) => {
    out.push(`${indent}Q${i + 1}. ${q.prompt}`);
    q.options.forEach((opt, oi) => {
      const mark = oi === q.correct_index ? "*" : " ";
      out.push(`${indent}   ${mark} ${String.fromCharCode(65 + oi)}) ${opt}`);
    });
    if (q.explanation) out.push(`${indent}   -> ${q.explanation}`);
    out.push("");
  });
  return out;
}

export function renderJourneyText(journey: TextJourney): string {
  const lines: string[] = [];
  lines.push(LINE);
  lines.push(journey.lessonTitle);
  lines.push(LINE);
  if (journey.objectivesTotal !== undefined) {
    lines.push(`Progress: ${journey.objectivesDone ?? 0}/${journey.objectivesTotal} objectives`);
  }
  if (journey.finalScore !== undefined && journey.finalScore !== null) {
    lines.push(`Final test score: ${journey.finalScore}%`);
  }
  lines.push("");

  journey.sprints.forEach((s, si) => {
    lines.push(`SPRINT ${si + 1}: ${s.title}`);
    if (s.summary) lines.push(`  ${s.summary}`);
    lines.push("");
    s.objectives.forEach((o, oi) => {
      const status = o.completed === undefined ? "" : o.completed ? " [done]" : " [not done]";
      lines.push(`  Objective ${si + 1}.${oi + 1}: ${o.title}${status}`);
      if (o.body) lines.push(`    ${o.body}`);
      lines.push("");
      lines.push(...renderQuestions(o.questions, "    "));
    });
    lines.push("");
  });

  if (journey.finalQuestions?.length) {
    lines.push(LINE);
    lines.push("FINAL TEST");
    lines.push(LINE);
    lines.push("");
    lines.push(...renderQuestions(journey.finalQuestions, "  "));
  }

  lines.push("(* marks the correct option)");
  return lines.join("\n");
}
