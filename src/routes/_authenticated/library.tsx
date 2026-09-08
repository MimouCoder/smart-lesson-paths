import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { extractPdfText } from "@/lib/pdf";
import { buildJourney } from "@/lib/journey.functions";

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({
    meta: [
      { title: "My lessons — Frost" },
      { name: "description", content: "Every lesson you uploaded and how far you got in it." },
      { property: "og:title", content: "My lessons — Frost" },
      { property: "og:description", content: "Your uploaded lessons and study progress." },
    ],
  }),
  component: Library,
});

const statusLabel: Record<string, string> = {
  pending: "Waiting",
  building: "Building journey…",
  ready: "Ready",
  failed: "Needs another try",
};

function Library() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const { data: lessons, isLoading } = useQuery({
    queryKey: ["lessons"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lessons")
        .select("id, title, file_name, status, final_score, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function onFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Please choose a PDF file.");
      return;
    }
    try {
      setBusy("Reading your lesson…");
      const text = await extractPdfText(file);
      if (text.trim().length < 200) {
        throw new Error("We couldn't read text from that PDF — it may be a scan of images.");
      }

      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Please sign in again.");

      setBusy("Saving the file…");
      const path = `${uid}/${crypto.randomUUID()}.pdf`;
      const up = await supabase.storage.from("lessons").upload(path, file, {
        contentType: "application/pdf",
      });
      if (up.error) throw new Error(up.error.message);

      const title = file.name.replace(/\.pdf$/i, "");
      const { data: lesson, error } = await supabase
        .from("lessons")
        .insert({
          user_id: uid,
          title,
          file_name: file.name,
          storage_path: path,
          content: text,
          status: "building",
        })
        .select("id")
        .single();
      if (error || !lesson) throw new Error(error?.message ?? "Could not save the lesson.");

      setBusy("Building your sprints…");
      await buildJourney({ data: { lessonId: lesson.id } });
      await queryClient.invalidateQueries({ queryKey: ["lessons"] });
      toast.success("Your study journey is ready.");
      navigate({ to: "/study/$lessonId", params: { lessonId: lesson.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <main className="mx-auto max-w-[1240px] px-6 py-8">
      <AppHeader />

      <section className="glass edge spec rounded-3xl p-8">
        <h1 className="font-display text-2xl font-bold text-frost">My lessons</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-frost/60">
          Upload a lesson as a PDF. Frost reads it, splits it into sprints and objectives, and
          writes two questions for each objective.
        </p>

        <div className="mt-6">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
          <button
            disabled={Boolean(busy)}
            onClick={() => inputRef.current?.click()}
            className="rounded-lg bg-frost px-5 py-3 text-sm font-medium text-primary-foreground transition hover:bg-frost/90 disabled:opacity-60"
          >
            {busy ?? "Upload a lesson PDF"}
          </button>
          {busy ? (
            <p className="mt-3 text-xs text-frost/55">
              This can take a minute for a long lesson — keep this page open.
            </p>
          ) : null}
        </div>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? <p className="text-sm text-frost/50">Loading…</p> : null}
        {lessons?.length === 0 && !isLoading ? (
          <p className="text-sm text-frost/50">No lessons yet.</p>
        ) : null}
        {lessons?.map((l) => (
          <Link
            key={l.id}
            to="/study/$lessonId"
            params={{ lessonId: l.id }}
            className="glass edge spec-sm rounded-2xl p-5 transition hover:bg-white/80"
          >
            <div className="font-display font-semibold text-frost">{l.title}</div>
            <div className="mt-1 truncate text-xs text-frost/45">{l.file_name}</div>
            <div className="mt-4 flex items-center justify-between text-xs">
              <span className="edge rounded-full bg-mist/70 px-2.5 py-1 text-frost/65">
                {statusLabel[l.status] ?? l.status}
              </span>
              {l.final_score !== null ? (
                <span className="font-medium text-aqualine">Final {l.final_score}%</span>
              ) : null}
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}
