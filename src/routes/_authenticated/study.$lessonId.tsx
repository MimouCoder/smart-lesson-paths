import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { buildFinalExam } from "@/lib/journey.functions";
import { renderJourneyText } from "@/lib/journey-text";

export const Route = createFileRoute("/_authenticated/study/$lessonId")({
  head: () => ({
    meta: [
      { title: "Study room — Frost" },
      { name: "description", content: "Your lesson on the left, your sprint journey on the right." },
      { property: "og:title", content: "Study room — Frost" },
      { property: "og:description", content: "Work through your lesson sprint by sprint." },
    ],
  }),
  component: StudyRoom,
});

type Question = {
  id: string;
  objective_id: string | null;
  position: number;
  prompt: string;
  options: string[];
  correct_index: number;
  explanation: string;
  is_final: boolean;
  answered_correctly: boolean;
};

function StudyRoom() {
  const { lessonId } = Route.useParams();
  const queryClient = useQueryClient();
  const [openObjective, setOpenObjective] = useState<string | null>(null);
  const [showFinal, setShowFinal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["study", lessonId],
    queryFn: async () => {
      const [lessonRes, sprintRes, objRes, qRes] = await Promise.all([
        supabase
          .from("lessons")
          .select("id, title, storage_path, status, final_score")
          .eq("id", lessonId)
          .single(),
        supabase.from("sprints").select("*").eq("lesson_id", lessonId).order("position"),
        supabase.from("objectives").select("*").eq("lesson_id", lessonId).order("position"),
        supabase.from("questions").select("*").eq("lesson_id", lessonId).order("position"),
      ]);
      if (lessonRes.error) throw lessonRes.error;
      return {
        lesson: lessonRes.data,
        sprints: sprintRes.data ?? [],
        objectives: objRes.data ?? [],
        questions: (qRes.data ?? []) as unknown as Question[],
      };
    },
  });

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  useEffect(() => {
    const path = data?.lesson?.storage_path;
    if (!path) return;
    supabase.storage
      .from("lessons")
      .createSignedUrl(path, 60 * 60)
      .then(({ data: signed }) => setPdfUrl(signed?.signedUrl ?? null));
  }, [data?.lesson?.storage_path]);

  const objectives = data?.objectives ?? [];
  const sprints = data?.sprints ?? [];
  const questions = data?.questions ?? [];

  const doneCount = objectives.filter((o) => o.completed).length;
  const progress = objectives.length ? Math.round((doneCount / objectives.length) * 100) : 0;

  const sprintDone = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const s of sprints) {
      const own = objectives.filter((o) => o.sprint_id === s.id);
      map[s.id] = own.length > 0 && own.every((o) => o.completed);
    }
    return map;
  }, [sprints, objectives]);

  const firstLockedIndex = sprints.findIndex((s) => !sprintDone[s.id]);
  const allDone = objectives.length > 0 && doneCount === objectives.length;
  const finalQuestions = questions.filter((q) => q.is_final);

  async function markCorrect(questionId: string, objectiveId: string) {
    await supabase.from("questions").update({ answered_correctly: true }).eq("id", questionId);
    const own = questions.filter((q) => q.objective_id === objectiveId);
    const allRight = own.every((q) => q.id === questionId || q.answered_correctly);
    if (allRight) {
      await supabase.from("objectives").update({ completed: true }).eq("id", objectiveId);
      toast.success("Objective cleared.");
    }
    await queryClient.invalidateQueries({ queryKey: ["study", lessonId] });
  }

  async function openFinal() {
    try {
      if (!finalQuestions.length) {
        toast.info("Building your final test…");
        await buildFinalExam({ data: { lessonId } });
        await queryClient.invalidateQueries({ queryKey: ["study", lessonId] });
      }
      setShowFinal(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not build the final test.");
    }
  }

  function downloadText() {
    const text = renderJourneyText({
      lessonTitle: data?.lesson?.title ?? "Lesson",
      objectivesDone: doneCount,
      objectivesTotal: objectives.length,
      finalScore: data?.lesson?.final_score ?? null,
      sprints: sprints.map((s) => ({
        title: s.title,
        summary: s.summary,
        objectives: objectives
          .filter((o) => o.sprint_id === s.id)
          .map((o) => ({
            title: o.title,
            body: o.body,
            completed: o.completed,
            questions: questions.filter((q) => q.objective_id === o.id),
          })),
      })),
      finalQuestions: finalQuestions,
    });
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(data?.lesson?.title ?? "study-journey").replace(/[^\w\u0600-\u06FF -]+/g, "")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Saved as a text file.");
  }

  if (isLoading) {
    return <main className="mx-auto max-w-[1400px] px-6 py-8 text-sm text-frost/60">Loading…</main>;
  }

  return (
    <main className="mx-auto max-w-[1400px] px-6 py-8">
      <AppHeader
        right={
          <div className="flex items-center gap-3">
            <button
              onClick={downloadText}
              className="edge rounded-lg bg-white/70 px-3 py-1.5 text-xs font-medium text-frost transition hover:bg-white"
            >
              Save as text file
            </button>
            <Link to="/library" className="text-xs font-medium text-frost/60 hover:text-frost">
              My lessons
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <section className="glass edge spec rounded-3xl p-4 lg:col-span-7">
          <div className="mb-3 px-2 font-display text-lg font-bold text-frost">
            {data?.lesson?.title}
          </div>
          <div className="edge h-[72vh] overflow-hidden rounded-2xl bg-white">
            {pdfUrl ? (
              <iframe src={pdfUrl} title="Lesson PDF" className="size-full" />
            ) : (
              <div className="grid size-full place-items-center text-sm text-frost/50">
                Opening your lesson…
              </div>
            )}
          </div>
        </section>

        <aside className="lg:col-span-5">
          <div className="glass edge spec rounded-3xl p-6">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-lg font-bold text-frost">Study journey</h2>
              <span className="text-xs text-frost/55">
                {doneCount}/{objectives.length} objectives
              </span>
            </div>
            <div className="journey-bar mt-3 h-2 overflow-hidden rounded-full bg-mist">
              <div
                className="h-full rounded-full bg-aqualine transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="mt-5 space-y-3">
              {sprints.map((s, i) => {
                const locked = firstLockedIndex !== -1 && i > firstLockedIndex;
                const own = objectives.filter((o) => o.sprint_id === s.id);
                return (
                  <div
                    key={s.id}
                    className={`edge rounded-2xl bg-white/65 p-4 ${locked ? "opacity-55" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] tracking-wide text-frost/45">
                          Sprint {i + 1}
                        </div>
                        <div className="font-display font-semibold text-frost">{s.title}</div>
                      </div>
                      <span className="edge shrink-0 rounded-full bg-mist/70 px-2.5 py-1 text-[11px] text-frost/65">
                        {sprintDone[s.id] ? "Cleared" : locked ? "Locked" : "In progress"}
                      </span>
                    </div>
                    {s.summary ? (
                      <p className="mt-2 text-xs leading-5 text-frost/55">{s.summary}</p>
                    ) : null}

                    {!locked ? (
                      <div className="mt-3 space-y-2">
                        {own.map((o) => (
                          <div key={o.id} className="edge rounded-xl bg-white/80 p-3">
                            <button
                              className="flex w-full items-center justify-between gap-3 text-left"
                              onClick={() =>
                                setOpenObjective(openObjective === o.id ? null : o.id)
                              }
                            >
                              <span className="text-sm font-medium text-frost">{o.title}</span>
                              <span
                                className={`shrink-0 text-xs ${o.completed ? "text-aqualine" : "text-frost/45"}`}
                              >
                                {o.completed ? "Done" : "Quiz"}
                              </span>
                            </button>
                            {openObjective === o.id ? (
                              <div className="mt-3 space-y-4">
                                {o.body ? (
                                  <p className="text-xs leading-5 text-frost/55">{o.body}</p>
                                ) : null}
                                {questions
                                  .filter((q) => q.objective_id === o.id)
                                  .map((q, qi) => (
                                    <QuestionCard
                                      key={q.id}
                                      index={qi}
                                      question={q}
                                      onCorrect={() => markCorrect(q.id, o.id)}
                                    />
                                  ))}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="final-panel edge mt-5 rounded-2xl p-5">
              <div className="font-display font-semibold text-frost">Final sprint test</div>
              <p className="mt-1 text-xs leading-5 text-frost/60">
                Ten questions drawn from the whole lesson. Unlocks when every objective is cleared.
              </p>
              <button
                disabled={!allDone}
                onClick={openFinal}
                className="mt-4 rounded-lg bg-frost px-4 py-2.5 text-xs font-medium text-primary-foreground transition hover:bg-frost/90 disabled:opacity-50"
              >
                {allDone ? "Start the final test" : "Locked"}
              </button>
              {data?.lesson?.final_score !== null && data?.lesson?.final_score !== undefined ? (
                <div className="mt-3 text-xs font-medium text-aqualine">
                  Last score: {data.lesson.final_score}%
                </div>
              ) : null}
            </div>
          </div>
        </aside>
      </div>

      {showFinal ? (
        <FinalExam
          questions={finalQuestions}
          onClose={() => setShowFinal(false)}
          onFinish={async (score) => {
            await supabase.from("lessons").update({ final_score: score }).eq("id", lessonId);
            await queryClient.invalidateQueries({ queryKey: ["study", lessonId] });
          }}
        />
      ) : null}
    </main>
  );
}

function QuestionCard({
  question,
  index,
  onCorrect,
}: {
  question: Question;
  index: number;
  onCorrect: () => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked !== null;
  const right = picked === question.correct_index;

  return (
    <div>
      <div className="text-xs font-medium text-frost">
        Q{index + 1}. {question.prompt}
      </div>
      <div className="mt-2 space-y-1.5">
        {question.options.map((opt, i) => {
          const state =
            answered && i === question.correct_index
              ? "border-aqualine bg-glacier/25"
              : answered && i === picked
                ? "border-destructive/50 bg-destructive/10"
                : "bg-white/70";
          return (
            <button
              key={i}
              disabled={answered || question.answered_correctly}
              onClick={() => {
                setPicked(i);
                if (i === question.correct_index) onCorrect();
              }}
              className={`edge w-full rounded-lg px-3 py-2 text-left text-xs text-frost/80 transition hover:bg-white ${state}`}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {answered ? (
        <p className="mt-2 text-[11px] leading-5 text-frost/60">
          {right ? "Correct. " : "Not quite. "}
          {question.explanation}
        </p>
      ) : null}
      {!answered && question.answered_correctly ? (
        <p className="mt-2 text-[11px] text-aqualine">Already answered correctly.</p>
      ) : null}
    </div>
  );
}

function FinalExam({
  questions,
  onClose,
  onFinish,
}: {
  questions: Question[];
  onClose: () => void;
  onFinish: (score: number) => Promise<void>;
}) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const correct = questions.filter((q) => answers[q.id] === q.correct_index).length;
  const score = questions.length ? Math.round((correct / questions.length) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-frost/40 p-6 backdrop-blur-sm">
      <div className="glass edge spec mx-auto max-w-2xl rounded-3xl p-7">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-frost">Final sprint test</h2>
          <button onClick={onClose} className="text-xs text-frost/55 hover:text-frost">
            Close
          </button>
        </div>

        <div className="mt-5 space-y-5">
          {questions.map((q, qi) => (
            <div key={q.id} className="edge rounded-2xl bg-white/75 p-4">
              <div className="text-sm font-medium text-frost">
                {qi + 1}. {q.prompt}
              </div>
              <div className="mt-2 space-y-1.5">
                {q.options.map((opt, i) => {
                  const chosen = answers[q.id] === i;
                  const state = submitted
                    ? i === q.correct_index
                      ? "border-aqualine bg-glacier/25"
                      : chosen
                        ? "border-destructive/50 bg-destructive/10"
                        : "bg-white/70"
                    : chosen
                      ? "border-aqualine bg-glacier/20"
                      : "bg-white/70";
                  return (
                    <button
                      key={i}
                      disabled={submitted}
                      onClick={() => setAnswers((a) => ({ ...a, [q.id]: i }))}
                      className={`edge w-full rounded-lg px-3 py-2 text-left text-xs text-frost/80 transition hover:bg-white ${state}`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              {submitted ? (
                <p className="mt-2 text-[11px] leading-5 text-frost/60">{q.explanation}</p>
              ) : null}
            </div>
          ))}
        </div>

        {submitted ? (
          <div className="final-panel edge mt-6 rounded-2xl p-5 text-center">
            <div className="font-display text-2xl font-bold text-frost">{score}%</div>
            <div className="mt-1 text-xs text-frost/60">
              {correct} of {questions.length} correct
            </div>
          </div>
        ) : (
          <button
            disabled={Object.keys(answers).length < questions.length}
            onClick={async () => {
              setSubmitted(true);
              await onFinish(score);
            }}
            className="mt-6 w-full rounded-lg bg-frost px-4 py-3 text-sm font-medium text-primary-foreground transition hover:bg-frost/90 disabled:opacity-50"
          >
            Submit answers
          </button>
        )}
      </div>
    </div>
  );
}
