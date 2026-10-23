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
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  // Veio do link "redefinir senha" do e-mail: pede a senha nova antes de entrar
  const [recovering, setRecovering] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isDemo) return;
    supabase!.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase!.auth.onAuthStateChange((e, s) => {
      if (e === "PASSWORD_RECOVERY") setRecovering(true);
      setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (recovering && session) return <NewPassword onDone={() => setRecovering(false)} />;
  if (isDemo || session) return <>{children}</>;
  if (session === undefined) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Carregando…</div>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    if (mode === "reset") {
      const { error } = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/studio` });
      setBusy(false);
      if (error) toast.error(error.message);
      else toast.success("Se esse e-mail tem conta, chegou um link para criar a senha nova. Confira também o spam.", { duration: 10000 });
      return;
    }
    const { error } = mode === "login"
      ? await supabase!.auth.signInWithPassword({ email, password })
      : await supabase!.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/studio` } });
    setBusy(false);
    if (error) {
      toast.error(/signups? not allowed/i.test(error.message) ? "Novos cadastros estão fechados. Entre com a conta do dono do Studio."
        : /invalid login/i.test(error.message) ? "E-mail ou senha errados. Se não lembra a senha, use \"Esqueci a senha\"."
        : error.message);
    }
    else if (mode === "signup") toast.success("Conta criada! Confirme pelo e-mail, se for pedido, e entre.");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm shadow-none">
        <CardHeader className="space-y-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground text-sm font-semibold text-background">S</span>
          <div>
            <CardTitle className="text-lg">{mode === "login" ? "Entrar no Social Studio" : mode === "reset" ? "Criar senha nova" : "Criar acesso ao Social Studio"}</CardTitle>
            <CardDescription>Instagram, TikTok e WhatsApp num só lugar.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {mode !== "reset" && (
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            )}
            {mode === "signup" && (
              <p className="text-xs text-amber-600">Criar conta abre um Studio novo e vazio. Se você já usa o Studio, volte e entre com o e-mail de sempre.</p>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Aguarde…" : mode === "login" ? "Entrar" : mode === "reset" ? "Mandar link para o e-mail" : "Criar conta"}
            </Button>
            {mode === "login" && (
              <button type="button" className="w-full text-center text-sm text-muted-foreground hover:underline" onClick={() => setMode("reset")}>
                Esqueci a senha
              </button>
            )}
            <button type="button" className="w-full text-center text-sm text-muted-foreground hover:underline" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
              {mode === "login" ? "Não tem conta? Criar agora" : "Voltar para entrar"}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function NewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase!.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Senha nova salva!");
    onDone();
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm shadow-none">
        <CardHeader><CardTitle className="text-lg">Escolha a senha nova</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-4">
            <Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha nova (mínimo 6)" />
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Salvando…" : "Salvar e entrar"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
