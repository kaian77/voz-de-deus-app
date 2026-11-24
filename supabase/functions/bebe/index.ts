// App Cantinho do bebê (/bebe/). Público (sem JWT do Supabase): a conta é própria, com sessão em bebe_auth.
//   { action: "signup" | "login" } -> { session, user, families }
//   depois { action, session, ... } — regras em _shared/bebe.ts
import { adminClient, corsHeaders, handleError, HttpError, json } from "../_shared/util.ts";
import * as B from "../_shared/bebe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") return json({ ok: true });
    const b = await req.json().catch(() => ({}));
    const db = adminClient();
    switch (b.action) {
      case "signup": return json(await B.signup(db, b));
      case "login": return json(await B.login(db, b));
      case "logout": return json(await B.logout(db, b.session));
      case "push_key": return json(await B.pushKey(db));
      case "reset_request": return json(await B.resetRequest(db, b));
      case "reset_confirm": return json(await B.resetConfirm(db, b));
    }
    const u = await B.userBySession(db, b.session);
    switch (b.action) {
      case "me": return json(await B.me(db, u));
      case "family_create": return json(await B.familyCreate(db, u, b));
      case "family_get": return json(await B.familyGet(db, u, b));
      case "family_save": return json(await B.familySave(db, u, b));
      case "family_rename": return json(await B.familyRename(db, u, b));
      case "members": return json(await B.members(db, u, b));
      case "new_invite": return json(await B.newInvite(db, u, b));
      case "join": return json(await B.join(db, u, b));
      case "set_role": return json(await B.setRole(db, u, b));
      case "leave": return json(await B.leave(db, u, b));
      case "delete_account": return json(await B.deleteAccount(db, u));
      case "push_subscribe": return json(await B.pushSubscribe(db, u, b));
      case "push_off": return json(await B.pushOff(db, u, b.endpoint));
      case "push_test": return json(await B.pushTest(db, u));
      case "photo_upload": return json(await B.photoUpload(db, u, b));
      case "photo_get": return json(await B.photoGet(db, u, b));
      case "photo_clean": return json(await B.photoClean(db, u, b));
      case "receipt_ai": return json(await B.receiptAI(db, u, b));
      case "room_ai": return json(await B.roomAI(db, u, b));
      case "babybot": return json(await B.babybot(db, u, b));
      case "access": return json(await B.accessOf(db, u));
      case "subscribe": return json(await B.subscribe(db, u));
      case "grants": return json(await B.grants(db, u, b));
    }
    throw new HttpError(400, "Ação desconhecida");
  } catch (e) {
    return handleError(e);
  }
});
