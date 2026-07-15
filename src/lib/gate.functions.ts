import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

import { getDB } from "@/lib/db.server";

type GateSession = { unlocked?: boolean };

type Idea = {
  id: string;
  raw: string;
  efficiency: string;
  friction_killer: string;
  unit_economics: string;
  created_at: string;
};

function sessionConfig() {
  const password = process.env.SESSION_SECRET;
  if (!password) throw new Error("SESSION_SECRET is not set");
  return {
    password,
    name: "ideavault_gate",
    maxAge: 60 * 60 * 24 * 7,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "none" as const,
      path: "/",
    },
  };
}

function passwordMatches(input: string, expected: string) {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

async function requireUnlocked() {
  const session = await useSession<GateSession>(sessionConfig());
  if (!session.data.unlocked) {
    throw new Error("LOCKED");
  }
  return session;
}

export const getVaultState = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ unlocked: boolean; ideas: Idea[] }> => {
    const session = await useSession<GateSession>(sessionConfig());
    if (!session.data.unlocked) return { unlocked: false, ideas: [] };

    const { results } = await getDB()
      .prepare(
        "SELECT id, raw, efficiency, friction_killer, unit_economics, created_at FROM ideas ORDER BY created_at DESC",
      )
      .all<Idea>();
    return { unlocked: true, ideas: results ?? [] };
  },
);

export const unlockSite = createServerFn({ method: "POST" })
  .inputValidator((data: { password: string }) => {
    if (typeof data?.password !== "string" || data.password.length === 0 || data.password.length > 128) {
      throw new Error("Invalid input");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const expected = process.env.SITE_PASSWORD;
    if (!expected) throw new Error("SITE_PASSWORD is not set");
    if (!passwordMatches(data.password, expected)) {
      return { ok: false as const };
    }
    const session = await useSession<GateSession>(sessionConfig());
    await session.update({ unlocked: true });
    return { ok: true as const };
  });

export const lockSite = createServerFn({ method: "POST" }).handler(async () => {
  const session = await useSession<GateSession>(sessionConfig());
  await session.clear();
  return { ok: true as const };
});

const SYSTEM_PROMPT = `You are a hyper-logical, ruthless startup incubator director and master systems architect. Strip away all marketing fluff, hype, and adjectives from the user's input. Deconstruct their raw idea into exactly three ruthlessly logical, distinct, and economically viable Unique Value Propositions:

1. The Core Efficiency (The operational or financial problem it solves instantly)
2. The Friction Killer (Why early adopters will choose this over existing alternatives)
3. The Unit Economic Hook (How this scales profitably or captures B2B value)

Keep each proposition under two sentences, maximizing density of information and eliminating fluff. Respond in strict JSON with keys "efficiency", "friction_killer", "unit_economics". No preamble, no markdown.`;

async function refineWithAI(raw: string): Promise<{
  efficiency: string;
  friction_killer: string;
  unit_economics: string;
}> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not set");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Raw venture concept:\n\n${raw}\n\nReturn JSON now.` },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429) throw new Error("Rate limited — try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in workspace billing.");
    throw new Error(`AI request failed [${res.status}]: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content ?? "";
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("AI returned malformed JSON.");
  }

  const efficiency = String(parsed.efficiency ?? "").trim();
  const friction_killer = String(parsed.friction_killer ?? parsed.frictionKiller ?? "").trim();
  const unit_economics = String(parsed.unit_economics ?? parsed.unitEconomics ?? "").trim();
  if (!efficiency || !friction_killer || !unit_economics) {
    throw new Error("AI response missing required fields.");
  }
  return { efficiency, friction_killer, unit_economics };
}

export const refineAndVault = createServerFn({ method: "POST" })
  .inputValidator((data: { raw: string }) => {
    if (typeof data?.raw !== "string") throw new Error("Invalid input");
    const raw = data.raw.trim();
    if (raw.length < 8) throw new Error("Idea too short — give it more substance.");
    if (raw.length > 4000) throw new Error("Idea too long — keep under 4000 chars.");
    return { raw };
  })
  .handler(async ({ data }): Promise<Idea> => {
    await requireUnlocked();
    const refined = await refineWithAI(data.raw);
    const idea: Idea = {
      id: randomUUID(),
      raw: data.raw,
      efficiency: refined.efficiency,
      friction_killer: refined.friction_killer,
      unit_economics: refined.unit_economics,
      created_at: new Date().toISOString(),
    };
    await getDB()
      .prepare(
        "INSERT INTO ideas (id, raw, efficiency, friction_killer, unit_economics, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(idea.id, idea.raw, idea.efficiency, idea.friction_killer, idea.unit_economics, idea.created_at)
      .run();
    return idea;
  });

export const purgeIdea = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => {
    if (typeof data?.id !== "string" || !/^[0-9a-f-]{36}$/i.test(data.id)) {
      throw new Error("Invalid id");
    }
    return data;
  })
  .handler(async ({ data }) => {
    await requireUnlocked();
    await getDB().prepare("DELETE FROM ideas WHERE id = ?").bind(data.id).run();
    return { ok: true as const };
  });

export type { Idea };