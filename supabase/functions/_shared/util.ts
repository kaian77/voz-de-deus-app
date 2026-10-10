import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, mcp-session-id, mcp-protocol-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });
}

export function env(name: string, fallback?: string): string {
  const value = Deno.env.get(name) ?? fallback;
  if (value === undefined) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

export function adminClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

/** Resolve o usuário logado a partir do JWT do Supabase enviado pelo app. */
export async function requireUser(req: Request): Promise<string> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Não autenticado");
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Sessão inválida");
  return data.user.id;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function handleError(err: unknown) {
  const status = err instanceof HttpError ? err.status : 500;
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  return json({ error: message }, status);
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function hmacHex(secret: string, payload: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** State do OAuth assinado: "<userId>.<expira>.<assinatura>" — evita CSRF e liga o callback ao usuário. */
export async function signState(userId: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + 600;
  const payload = `${userId}.${exp}`;
  return `${payload}.${await hmacHex(env("OAUTH_STATE_SECRET"), payload)}`;
}

export async function verifyState(state: string | null): Promise<string> {
  const [userId, exp, sig] = (state ?? "").split(".");
  if (!userId || !exp || !sig) throw new HttpError(400, "State inválido");
  if (Number(exp) < Date.now() / 1000) throw new HttpError(400, "State expirado, tente conectar de novo");
  const expected = await hmacHex(env("OAUTH_STATE_SECRET"), `${userId}.${exp}`);
  if (!timingSafeEqual(expected, sig)) throw new HttpError(400, "State inválido");
  return userId;
}

export function functionsUrl(name: string): string {
  return `${env("SUPABASE_URL")}/functions/v1/${name}`;
}

export function appUrl(path = ""): string {
  return `${env("APP_URL").replace(/\/$/, "")}${path}`;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
