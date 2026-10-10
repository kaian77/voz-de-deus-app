// Camada de dados do Studio: Supabase quando configurado, senão modo demo (localStorage).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";
import { demoInvoke, demoSeed } from "./demo";
import type { BrandSettings, Post, TableMap, TableName } from "./types";

export const isDemo = !SUPABASE_URL || !SUPABASE_ANON_KEY;
export const supabase: SupabaseClient | null = isDemo ? null : createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export const functionsBaseUrl = isDemo ? "https://SEU-PROJETO.supabase.co/functions/v1" : `${SUPABASE_URL}/functions/v1`;

// ---------------------------------------------------------------------------
// Armazenamento do modo demo
// ---------------------------------------------------------------------------
const DEMO_KEY = "social-studio-demo-v1";
type DemoDb = { [K in TableName]: TableMap[K][] };

function readDemo(): DemoDb {
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    if (raw) return { ...demoSeed(), ...JSON.parse(raw) }; // tabelas novas ganham dados de exemplo
  } catch {
    /* storage indisponível */
  }
  const seed = demoSeed();
  writeDemo(seed);
  return seed;
}
function writeDemo(db: DemoDb) {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(db));
  } catch {
    /* storage cheio ou bloqueado: segue só em memória */
  }
}
export function resetDemo() {
  try {
    localStorage.removeItem(DEMO_KEY);
  } catch {
    /* ignore */
  }
}

async function userId(): Promise<string> {
  const { data } = await supabase!.auth.getUser();
  if (!data.user) throw new Error("Faça login novamente");
  return data.user.id;
}

const fail = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

type ListOptions = { order?: string; ascending?: boolean; limit?: number; eq?: Record<string, string> };

export const api = {
  async list<T extends TableName>(table: T, opts: ListOptions = {}): Promise<TableMap[T][]> {
    const order = opts.order ?? "created_at";
    const ascending = opts.ascending ?? false;
    if (isDemo) {
      const rows = (readDemo()[table] as TableMap[T][]).filter((r) =>
        Object.entries(opts.eq ?? {}).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v),
      );
      rows.sort((a, b) => {
        const av = String((a as unknown as Record<string, unknown>)[order] ?? "");
        const bv = String((b as unknown as Record<string, unknown>)[order] ?? "");
        return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
      });
      return opts.limit ? rows.slice(0, opts.limit) : rows;
    }
    let q = supabase!.from(table).select("*").order(order, { ascending });
    for (const [k, v] of Object.entries(opts.eq ?? {})) q = q.eq(k, v);
    if (opts.limit) q = q.limit(opts.limit);
    const { data, error } = await q;
    fail(error);
    return data as TableMap[T][];
  },

  async insert<T extends TableName>(table: T, row: Partial<TableMap[T]>): Promise<TableMap[T]> {
    if (isDemo) {
      const db = readDemo();
      const stamp = new Date().toISOString();
      const full = { id: crypto.randomUUID(), created_at: stamp, updated_at: stamp, ...row } as TableMap[T];
      (db[table] as TableMap[T][]).unshift(full);
      writeDemo(db);
      return full;
    }
    const { data, error } = await supabase!.from(table).insert({ ...(row as object), user_id: await userId() }).select().single();
    fail(error);
    return data as TableMap[T];
  },

  async update<T extends TableName>(table: T, id: string, patch: Partial<TableMap[T]>): Promise<TableMap[T]> {
    if (isDemo) {
      const db = readDemo();
      const rows = db[table] as (TableMap[T] & { id: string })[];
      const i = rows.findIndex((r) => r.id === id);
      if (i < 0) throw new Error("Registro não encontrado");
      rows[i] = { ...rows[i], ...patch, updated_at: new Date().toISOString() };
      writeDemo(db);
      return rows[i];
    }
    const { data, error } = await supabase!.from(table).update(patch as never).eq("id", id).select().single();
    fail(error);
    return data as TableMap[T];
  },

  async remove(table: TableName, id: string) {
    if (isDemo) {
      const db = readDemo();
      (db[table] as { id: string }[]) = (db[table] as { id: string }[]).filter((r) => r.id !== id);
      writeDemo(db);
      return;
    }
    const { error } = await supabase!.from(table).delete().eq("id", id);
    fail(error);
  },

  async getSettings(): Promise<BrandSettings | null> {
    if (isDemo) return readDemo().brand_settings[0] ?? null;
    const { data, error } = await supabase!.from("brand_settings").select("*").maybeSingle();
    fail(error);
    return data;
  },

  async saveSettings(patch: Partial<BrandSettings>): Promise<BrandSettings> {
    if (isDemo) {
      const db = readDemo();
      db.brand_settings[0] = { ...(db.brand_settings[0] ?? { approval_required: true, timezone: "America/Sao_Paulo" }), ...patch } as BrandSettings;
      writeDemo(db);
      return db.brand_settings[0];
    }
    const { data, error } = await supabase!
      .from("brand_settings")
      .upsert({ ...patch, user_id: await userId(), updated_at: new Date().toISOString() })
      .select()
      .single();
    fail(error);
    return data;
  },

  /** Chama uma edge function. `fn` pode incluir query string (ex: "oauth-instagram?action=start"). */
  async invoke<R = unknown>(fn: string, body: Record<string, unknown> = {}): Promise<R> {
    if (isDemo) {
      await new Promise((r) => setTimeout(r, 700));
      return demoInvoke(fn.split("?")[0], body) as R;
    }
    const { data: session } = await supabase!.auth.getSession();
    const res = await fetch(`${functionsBaseUrl}/${fn}`, {
      method: fn.includes("action=start") ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${session.session?.access_token ?? SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
        ...(fn.includes("action=start") ? {} : { "Content-Type": "application/json" }),
      },
      body: fn.includes("action=start") ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error) throw new Error(data?.error ?? `Erro ${res.status}`);
    return data as R;
  },

  async publishNow(post: Post): Promise<Post> {
    if (isDemo) {
      return api.update("posts", post.id, {
        status: "published",
        published_at: new Date().toISOString(),
        results: Object.fromEntries(post.platforms.map((p) => [p, { status: "published" }])),
      });
    }
    await api.invoke("publish-scheduled", { post_id: post.id });
    const { data } = await supabase!.from("posts").select("*").eq("id", post.id).single();
    return data as Post;
  },

  /** Envia um arquivo para o bucket público "media" e devolve a URL. */
  async upload(file: Blob, name: string): Promise<string> {
    if (isDemo) {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
    }
    const path = `${await userId()}/${crypto.randomUUID()}-${name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await supabase!.storage.from("media").upload(path, file, { contentType: file.type || undefined });
    fail(error);
    return supabase!.storage.from("media").getPublicUrl(path).data.publicUrl;
  },
};

export async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return "sst_" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
