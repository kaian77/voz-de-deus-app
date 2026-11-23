// Teste de ponta a ponta da função `bebe` (Cantinho do bebê): duas contas de teste, família, convite, sincronização
// com conflito, acesso "só ver" e limpeza no fim. Rodar: SUPABASE_URL=... node scripts/bebe-test.mjs
const URL = `${process.env.SUPABASE_URL}/functions/v1/bebe`;
const call = async (action, body = {}) => {
  const r = await fetch(URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...body }) });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ...j };
};
let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"} ${msg}`); if (!cond) fails++; };
const tag = Date.now().toString(36);
const data = (items) => ({ v: 1, babies: [{ id: "b1", name: "Teste", nick: "", birth: "2026-06-01", sex: "", premature: false, notes: "", theme: "rosa" }], current: "b1", items, purchases: [], sleeps: [], measures: [], diapers: [], events: [], meds: [], wardrobe: { finish: "branco", light: "quente" }, budget: 0, barcodes: {}, mt: {}, del: {} });

const a = await call("signup", { name: "Teste A", email: `teste-a-${tag}@exemplo.invalid`, pass: "senha123" });
ok(a.session && a.user, "cria conta A");
const b = await call("signup", { name: "Teste B", email: `teste-b-${tag}@exemplo.invalid`, pass: "senha123" });
ok(b.session, "cria conta B");
ok((await call("login", { email: `teste-a-${tag}@exemplo.invalid`, pass: "errada" })).status === 400, "senha errada é recusada");
const f = await call("family_create", { session: a.session, name: "Família Teste", data: data([{ id: "i1", name: "Body", qty: 2 }]) });
ok(f.family?.id && f.family.role === "dono", "A cria a família");
const fam = f.family.id;
ok((await call("family_get", { session: b.session, family: fam })).status === 403, "B não vê antes do convite");
const m = await call("members", { session: a.session, family: fam });
ok(m.invite && m.members?.length === 1, "convite gerado");
const j = await call("join", { session: b.session, code: m.invite });
ok(j.family?.id === fam && j.family.role === "edita", "B entra pelo convite (pode editar)");
const g1 = await call("family_get", { session: b.session, family: fam });
ok(g1.data?.items?.[0]?.name === "Body" && g1.version === 1, "B baixa os dados da família");
const s1 = await call("family_save", { session: b.session, family: fam, base: g1.version, data: data([{ id: "i1", name: "Body", qty: 5 }]) });
ok(s1.ok && s1.version === 2, "B salva (versão 2)");
const s2 = await call("family_save", { session: a.session, family: fam, base: 1, data: data([{ id: "i1", name: "Body", qty: 9 }]) });
ok(s2.ok === false && s2.conflict && s2.version === 2 && s2.data.items[0].qty === 5, "A com versão velha recebe conflito e os dados novos");
ok((await call("set_role", { session: a.session, family: fam, user: b.user.id, role: "ve" })).ok, "A muda B para só ver");
ok((await call("family_save", { session: b.session, family: fam, base: 2, data: data([]) })).status === 403, "B (só ver) não consegue salvar");
ok((await call("set_role", { session: b.session, family: fam, user: a.user.id, role: "sair" })).status === 403, "B não consegue remover A");
ok((await call("push_key")).key?.length > 20, "chave dos avisos");
ok((await call("me", { session: b.session })).families?.length === 1, "B vê a família na lista");
ok((await call("delete_account", { session: b.session })).ok, "B apaga a conta");
ok((await call("delete_account", { session: a.session })).ok, "A apaga a conta (família some junto)");
ok((await call("me", { session: a.session })).status === 401, "sessão de A não vale mais");
console.log(fails ? `\n${fails} FALHA(S)` : "\nTUDO CERTO");
process.exit(fails ? 1 : 0);
