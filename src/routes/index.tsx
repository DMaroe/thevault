import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Lock, LockOpen, X } from "lucide-react";

import {
  getVaultState,
  lockSite,
  purgeIdea,
  refineAndVault,
  unlockSite,
  type Idea,
} from "@/lib/gate.functions";

const vaultQuery = queryOptions({
  queryKey: ["vault"],
  queryFn: () => getVaultState(),
});

export const Route = createFileRoute("/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(vaultQuery),
  component: Index,
});

function Index() {
  const { data } = useSuspenseQuery(vaultQuery);
  return data.unlocked ? <Dashboard ideas={data.ideas} /> : <PasscodeGate />;
}

function PasscodeGate() {
  const router = useRouter();
  const qc = useQueryClient();
  const unlock = useServerFn(unlockSite);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(next: string) {
    setPending(true);
    setError(null);
    try {
      const { ok } = await unlock({ data: { password: next } });
      if (ok) {
        await qc.invalidateQueries({ queryKey: ["vault"] });
        await router.invalidate();
      } else {
        setError("Incorrect passcode.");
        setPin("");
      }
    } catch {
      setError("Something went wrong.");
      setPin("");
    } finally {
      setPending(false);
    }
  }

  function press(v: string) {
    if (pending) return;
    setError(null);
    if (v === "back") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (v === "enter") {
      if (pin.length > 0) submit(pin);
      return;
    }
    const next = (pin + v).slice(0, 12);
    setPin(next);
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "back", "0", "enter"];

  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs flex flex-col items-center gap-10">
        <div className="flex flex-col items-center gap-3">
          <Lock className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
          <h1 className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Ideavault</h1>
        </div>

        <div className="flex gap-3 h-4 items-center">
          {Array.from({ length: Math.max(pin.length, 4) }).map((_, i) => (
            <span
              key={i}
              className={`h-2 w-2 rounded-full transition-colors ${
                i < pin.length ? "bg-foreground" : "bg-border"
              }`}
            />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 w-full">
          {keys.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => press(k)}
              disabled={pending}
              className="h-14 rounded-md border border-border bg-card text-lg font-light tracking-wider hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {k === "back" ? "←" : k === "enter" ? "↵" : k}
            </button>
          ))}
        </div>

        <p className="text-xs text-muted-foreground h-4">
          {error ?? (pending ? "Verifying…" : "Enter passcode")}
        </p>
      </div>
    </main>
  );
}

function Dashboard({ ideas }: { ideas: Idea[] }) {
  const qc = useQueryClient();
  const refine = useServerFn(refineAndVault);
  const purge = useServerFn(purgeIdea);
  const lock = useServerFn(lockSite);
  const router = useRouter();

  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refineMutation = useMutation({
    mutationFn: async (input: string) => refine({ data: { raw: input } }),
    onSuccess: () => {
      setRaw("");
      qc.invalidateQueries({ queryKey: ["vault"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const purgeMutation = useMutation({
    mutationFn: async (id: string) => purge({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vault"] }),
  });

  async function handleLock() {
    await lock({});
    await qc.invalidateQueries({ queryKey: ["vault"] });
    await router.invalidate();
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-between">
          <h1 className="text-sm uppercase tracking-[0.35em]">Ideavault</h1>
          <button
            type="button"
            onClick={handleLock}
            aria-label="Lock vault"
            className="p-2 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            <LockOpen className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 pt-12 pb-8">
        <textarea
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Dump a raw venture concept..."
          rows={6}
          disabled={refineMutation.isPending}
          className="w-full resize-none bg-transparent border border-border rounded-md p-5 text-base leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:border-foreground/40 transition-colors disabled:opacity-60"
        />

        <div className="mt-4 flex items-center justify-between gap-4">
          <p className="text-xs text-destructive min-h-4">{error ?? ""}</p>
          <button
            type="button"
            disabled={refineMutation.isPending || raw.trim().length < 8}
            onClick={() => {
              setError(null);
              refineMutation.mutate(raw);
            }}
            className="px-5 py-2.5 text-xs uppercase tracking-[0.25em] border border-foreground bg-foreground text-background hover:bg-transparent hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {refineMutation.isPending ? "Deconstructing…" : "Refine & Vault"}
          </button>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-24">
        {ideas.length === 0 ? (
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground text-center py-16">
            Vault empty
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {ideas.map((idea) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                onPurge={() => purgeMutation.mutate(idea.id)}
                purging={purgeMutation.isPending && purgeMutation.variables === idea.id}
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function IdeaCard({
  idea,
  onPurge,
  purging,
}: {
  idea: Idea;
  onPurge: () => void;
  purging: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const truncated = idea.raw.length > 140 && !expanded;
  const shown = truncated ? idea.raw.slice(0, 140).trimEnd() + "…" : idea.raw;
  const ts = new Date(idea.created_at).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <li className="border border-border rounded-md p-5 bg-card">
      <div className="flex items-center justify-between gap-4 mb-4">
        <time className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{ts}</time>
        <button
          type="button"
          onClick={onPurge}
          disabled={purging}
          aria-label="Purge"
          className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground/60 hover:text-destructive transition-colors flex items-center gap-1 disabled:opacity-40"
        >
          <X className="h-3 w-3" strokeWidth={1.5} />
          {purging ? "Purging" : "Purge"}
        </button>
      </div>

      <button
        type="button"
        onClick={() => idea.raw.length > 140 && setExpanded((v) => !v)}
        className="text-left text-sm text-muted-foreground leading-relaxed w-full mb-5 hover:text-foreground/70 transition-colors"
      >
        {shown}
      </button>

      <dl className="flex flex-col gap-3 border-t border-border pt-4">
        <UvpRow n="01" label="Core Efficiency" value={idea.efficiency} />
        <UvpRow n="02" label="Friction Killer" value={idea.friction_killer} />
        <UvpRow n="03" label="Unit Economic Hook" value={idea.unit_economics} />
      </dl>
    </li>
  );
}

function UvpRow({ n, label, value }: { n: string; label: string; value: string }) {
  return (
    <div className="grid grid-cols-[2rem_1fr] gap-3">
      <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground pt-1">
        {n}
      </span>
      <div>
        <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-1">
          {label}
        </p>
        <p className="text-sm text-foreground leading-relaxed">{value}</p>
      </div>
    </div>
  );
}
