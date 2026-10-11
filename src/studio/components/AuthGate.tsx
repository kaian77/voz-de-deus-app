import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isDemo, supabase } from "../lib/api";
import { useStudioTheme } from "./bits";

export default function AuthGate({ children }: { children: ReactNode }) {
  useStudioTheme();
  const [session, setSession] = useState<Session | null | undefined>(isDemo ? null : undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isDemo) return;
    supabase!.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase!.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (isDemo || session) return <>{children}</>;
  if (session === undefined) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Carregando…</div>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = mode === "login"
      ? await supabase!.auth.signInWithPassword({ email, password })
      : await supabase!.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/studio` } });
    setBusy(false);
    if (error) toast.error(error.message);
    else if (mode === "signup") toast.success("Conta criada! Confirme pelo e-mail, se for pedido, e entre.");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm shadow-none">
        <CardHeader className="space-y-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground text-sm font-semibold text-background">S</span>
          <div>
            <CardTitle className="text-lg">{mode === "login" ? "Entrar no Social Studio" : "Criar acesso ao Social Studio"}</CardTitle>
            <CardDescription>Instagram, TikTok e WhatsApp num só lugar.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}
            </Button>
            <button type="button" className="w-full text-center text-sm text-muted-foreground hover:underline" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
              {mode === "login" ? "Não tem conta? Criar agora" : "Já tenho conta"}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
