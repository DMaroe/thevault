import { createServerFn } from "@tanstack/react-start";
import { getRequest, useSession } from "@tanstack/react-start/server";

import { getDB, getRequiredEnv } from "@/lib/db";

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
  const request = getRequest();
  const secure = request != null && new URL(request.url).protocol === "https:";
  return {
    password: getRequiredEnv("SESSION_SECRET"),
    name: "ideavault_gate",
    maxAge: 60 * 60 * 24 * 7,
    cookie: {
      httpOnly: true,
      // `lax` is sufficient for this same-origin app and allows the passcode
      // gate to work in local Wrangler development over HTTP.
      secure,
      sameSite: "lax" as const,
      path: "/",
    },
  };
}

async function passwordMatches(input: string, expected: string) {
  const encoder = new TextEncoder();
  const [inputHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(input)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const a = new Uint8Array(inputHash);
  const b = new Uint8Array(expectedHash);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

async function useUnlockedSession() {
  // This is TanStack Start's request-session helper, not a React hook.
  // eslint-disable-next-line react-hooks/rules-of-hooks
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
  .validator((data: { password: string }) => {
    if (
      typeof data?.password !== "string" ||
      data.password.length === 0 ||
      data.password.length > 128
    ) {
      throw new Error("Invalid input");
    }
    return data;
  })
  .handler(async ({ data }) => {
    if (!(await passwordMatches(data.password, getRequiredEnv("SITE_PASSWORD")))) {
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
  const key = getRequiredEnv("OPENAI_API_KEY");

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      store: false,
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Raw venture concept:\n\n${raw}\n\nReturn JSON now.` },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "idea_refinement",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              efficiency: { type: "string" },
              friction_killer: { type: "string" },
              unit_economics: { type: "string" },
            },
            required: ["efficiency", "friction_killer", "unit_economics"],
          },
        },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429) throw new Error("Rate limited — try again shortly.");
    if (res.status === 401) throw new Error("OpenAI API key is invalid or missing.");
    if (res.status === 402) throw new Error("OpenAI API credits are exhausted.");
    throw new Error(`AI request failed [${res.status}]: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  const content =
    json.output_text ??
    json.output
      ?.flatMap((output) => output.content ?? [])
      .find((part) => part.type === "output_text")?.text ??
    "";
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
  .validator((data: { raw: string }) => {
    if (typeof data?.raw !== "string") throw new Error("Invalid input");
    const raw = data.raw.trim();
    if (raw.length < 8) throw new Error("Idea too short — give it more substance.");
    if (raw.length > 4000) throw new Error("Idea too long — keep under 4000 chars.");
    return { raw };
  })
  .handler(async ({ data }): Promise<Idea> => {
    await useUnlockedSession();
    const refined = await refineWithAI(data.raw);
    const idea: Idea = {
      id: crypto.randomUUID(),
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
      .bind(
        idea.id,
        idea.raw,
        idea.efficiency,
        idea.friction_killer,
        idea.unit_economics,
        idea.created_at,
      )
      .run();
    return idea;
  });

export const purgeIdea = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => {
    if (typeof data?.id !== "string" || !/^[0-9a-f-]{36}$/i.test(data.id)) {
      throw new Error("Invalid id");
    }
    return data;
  })
  .handler(async ({ data }) => {
    await useUnlockedSession();
    await getDB().prepare("DELETE FROM ideas WHERE id = ?").bind(data.id).run();
    return { ok: true as const };
  });

export type { Idea };
