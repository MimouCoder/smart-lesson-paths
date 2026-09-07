import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Frost — Turn any lesson PDF into a study sprint" },
      {
        name: "description",
        content:
          "Upload a lesson PDF. Frost splits it into sprints and objectives, quizzes you on each one, and only unlocks the next when you pass.",
      },
      { property: "og:title", content: "Frost — Sprint Study Studio" },
      {
        property: "og:description",
        content: "Upload a lesson PDF and study it as a gated sprint journey.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user)));
  }, []);

  return (
    <main className="mx-auto max-w-[1240px] px-6 py-10 lg:py-16">
      <header className="glass edge spec-sm relative z-20 mb-10 flex items-center justify-between rounded-2xl px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-frost font-display text-lg font-bold text-primary-foreground">
            F
          </div>
          <div>
            <div className="font-display text-lg leading-none font-bold text-frost">Frost</div>
            <div className="text-[11px] tracking-wide text-frost/50">Sprint Study Studio</div>
          </div>
        </div>
        <Link
          to={signedIn ? "/library" : "/auth"}
          className="rounded-lg bg-frost px-4 py-2 text-xs font-medium text-primary-foreground transition hover:bg-frost/90"
        >
          {signedIn ? "My lessons" : "Sign in"}
        </Link>
      </header>

      <section className="glass edge spec rounded-3xl p-8 lg:p-14">
        <div className="edge mb-6 inline-flex items-center gap-2 rounded-full bg-mist/70 px-3 py-1.5">
          <span className="size-2 rounded-full bg-aqualine" />
          <span className="text-xs font-medium text-frost/70">Built for one lesson at a time</span>
        </div>
        <h1 className="max-w-3xl font-display text-4xl leading-tight font-bold text-frost lg:text-5xl">
          Give it your lesson. Get a study journey you have to earn.
        </h1>
        <p className="mt-5 max-w-2xl text-sm leading-7 text-frost/70">
          Frost reads your PDF, turns every main title into a sprint and every subtitle into an
          objective. Each objective comes with two questions — answer them and the next sprint
          unlocks. Finish them all and a final test built from the whole lesson opens up.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to={signedIn ? "/library" : "/auth"}
            className="rounded-lg bg-frost px-5 py-3 text-sm font-medium text-primary-foreground transition hover:bg-frost/90"
          >
            {signedIn ? "Open my study room" : "Start with a lesson"}
          </Link>
        </div>

        <div className="mt-12 grid gap-3 sm:grid-cols-3">
          {[
            { n: "1", t: "Upload the lesson", d: "A PDF is all it needs." },
            { n: "2", t: "Sprints appear", d: "Main titles become sprints, subtitles objectives." },
            { n: "3", t: "Answer to advance", d: "Two questions per objective, then the final test." },
          ].map((step) => (
            <div key={step.n} className="edge rounded-2xl bg-white/60 p-4">
              <div className="grid size-8 place-items-center rounded-full bg-aqualine text-xs font-bold text-accent-foreground">
                {step.n}
              </div>
              <div className="mt-3 font-display font-semibold text-frost">{step.t}</div>
              <div className="mt-1 text-xs leading-5 text-frost/55">{step.d}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
