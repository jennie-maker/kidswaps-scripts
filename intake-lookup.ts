import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://www.kidswaps.com",
  "https://kidswaps.com",
];

function corsHeadersFor(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-ms-token, apikey, content-type",
    "Vary": "Origin",
  };
}

function isOperator(memberstackId: string): boolean {
  const raw = Deno.env.get("OPERATOR_MEMBER_IDS") || "";
  const allow = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return allow.includes(memberstackId);
}

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req.headers.get("Origin"));

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    // 1. Admin gate — verify the Memberstack token
    const token = req.headers.get("x-ms-token");
    if (!token) {
      return json({ error: "no_token" }, 401, cors);
    }
    const vr = await fetch("https://admin.memberstack.com/members/verify-token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": Deno.env.get("MEMBERSTACK_SECRET")!,
      },
      body: JSON.stringify({ token }),
    });
    const vd = await vr.json();
    const memberstackId = vd?.data?.id;
    if (!memberstackId) {
      return json({ error: "invalid_token" }, 401, cors);
    }
    if (!isOperator(memberstackId)) {
      return json({ error: "not_authorized" }, 403, cors);
    }

    // 2. Parse body
    let body;
    try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400, cors); }

    // 2a. NEXT-LABEL MODE — returns a label to prefill the SKU field, blended:
    //     (1) if a graded item is waiting to be listed (get_next_unlisted), that
    //         wins -> mode:"graded" + remaining (the carry-forward record is then
    //         pulled by the existing {label} lookup path on the client).
    //     (2) else fall to the next sequential unused label across inventory +
    //         intake_records (get_next_sequential_label) -> mode:"fresh".
    //     The client always gets a label; mode tells it whether graded data follows.
    //
    //     FORCE-FRESH (fresh:true) — the manual type-switch path. When the client
    //     sets fresh:true it explicitly does NOT want a waiting graded item, so we
    //     SKIP the worklist and return the next sequential label as mode:"fresh".
    //     This stops a manual Clothing<->Toy switch from pulling a graded item and
    //     flipping the type back into a loop once grading is live. Absent/false =
    //     the normal graded-aware behavior, unchanged.
    if (str(body?.action) === "next_label") {
      const sb = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      const forceFresh = body?.fresh === true;

      // worklist first (skipped entirely when force-fresh)
      let gradedLabel: string | null = null;
      let remaining = 0;
      if (!forceFresh) {
        const { data: wl, error: wlErr } = await sb.rpc("get_next_unlisted");
        if (wlErr) {
          return json({ error: "next_label_failed", detail: wlErr.message }, 500, cors);
        }
        gradedLabel = wl?.label ?? null;
        remaining = wl?.remaining ?? 0;
      }

      if (gradedLabel) {
        return json({
          ok: true,
          label: gradedLabel,
          mode: "graded",
          remaining: remaining,
        }, 200, cors);
      }

      // queue empty (or force-fresh) -> next sequential counter label
      const { data: seq, error: seqErr } = await sb.rpc("get_next_sequential_label");
      if (seqErr) {
        return json({ error: "next_label_failed", detail: seqErr.message }, 500, cors);
      }
      return json({
        ok: true,
        label: seq ?? null,
        mode: "fresh",
        remaining: 0,
      }, 200, cors);
    }

    const label = str(body?.label);
    if (!label) {
      return json({ error: "missing_required", fields: ["label"] }, 400, cors);
    }

    // 3. Look up the accepted grading record via the curated RPC
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data, error } = await supabase.rpc("get_intake_by_label", { label });

    if (error) {
      return json({ error: "lookup_failed", detail: error.message }, 500, cors);
    }

    // RPC returns null when no accepted row matches the label
    if (data === null) {
      return json({ ok: true, found: false }, 200, cors);
    }

    return json({ ok: true, found: true, record: data }, 200, cors);
  } catch (e) {
    return json({ error: "unhandled", detail: String(e) }, 500, cors);
  }
});

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function json(obj: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
