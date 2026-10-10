// Conexão com o Supabase. Preencha via variáveis de ambiente (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
// ou cole aqui — a anon key é pública por natureza (a segurança vem das policies RLS).
// Sem essas informações o Studio roda em MODO DEMO, com dados salvos só no navegador.
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
