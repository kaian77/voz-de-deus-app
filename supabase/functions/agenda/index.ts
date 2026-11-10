// Agenda online da PáginasPro (pública, sem JWT do Supabase): página de agendamento do paciente e painel do
// profissional (sessão própria, e-mail + senha). Regras em _shared/agenda.ts.
//   paciente:      { action: "info" | "days" | "book", slug, ... }
//   profissional:  { action: "setup" | "login" } -> { session, token }; depois { action: "panel" | "save" | "appt" | "subscribe" | "logout", session, ... }
import { adminClient, corsHeaders, handleError, HttpError, json } from "../_shared/util.ts";
import {
  book, login, logout, pageBySession, pageBySlug, panel, publicDays, publicInfo, saveAppointment, saveSettings, setup, subscribeLink,
} from "../_shared/agenda.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") return json({ ok: true });
    const body = await req.json().catch(() => ({}));
    const db = adminClient();
    switch (body.action) {
      case "info":
        return json(publicInfo(await pageBySlug(db, body.slug)));
      case "days":
        return json(await publicDays(db, await pageBySlug(db, body.slug), Number(body.service) || 0, body.pro));
      case "book":
        return json(await book(db, await pageBySlug(db, body.slug), body));
      case "setup":
        return json(await setup(db, body));
      case "login":
        return json(await login(db, body));
      case "logout":
        return json(await logout(db, body.session));
    }
    const page = await pageBySession(db, body.session);
    switch (body.action) {
      case "panel":
        return json(await panel(db, page));
      case "save":
        return json(await saveSettings(db, page, body.settings));
      case "appt":
        return json(await saveAppointment(db, page, body));
      case "subscribe":
        return json(await subscribeLink(page, `https://paginaspro.app.br/r/${page.report_token}#agenda`));
    }
    throw new HttpError(400, "Ação desconhecida");
  } catch (e) {
    return handleError(e);
  }
});
