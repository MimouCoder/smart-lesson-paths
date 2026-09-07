import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function AppHeader({ right }: { right?: React.ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="glass edge spec-sm relative z-20 mb-5 flex items-center justify-between rounded-2xl px-5 py-4">
      <Link to="/library" className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-frost font-display text-lg font-bold text-primary-foreground">
          F
        </div>
        <div>
          <div className="font-display text-lg leading-none font-bold text-frost">Frost</div>
          <div className="text-[11px] tracking-wide text-frost/50">Sprint Study Studio</div>
        </div>
      </Link>
      <div className="flex items-center gap-4">
        {right}
        <button
          onClick={signOut}
          className="edge rounded-lg bg-white/70 px-3 py-2 text-xs font-medium text-frost/70 transition hover:bg-white"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
