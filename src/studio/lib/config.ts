// Conexão com o Supabase (só valores públicos: URL e chave anon/publishable).
// Aceita as variáveis VITE_* ou as NEXT_PUBLIC_* criadas pela integração Supabase da Vercel.
// Sem elas o Studio roda em MODO DEMO, com dados salvos só no navegador.
const env = import.meta.env;

export const SUPABASE_URL: string = env.VITE_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY: string =
  env.VITE_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
