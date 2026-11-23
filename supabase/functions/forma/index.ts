// App de treino FORMA (/treino). Público (sem JWT do Supabase): a conta é própria, com sessão em forma_auth.
//   { action: "signup" | "login" } -> { session, user, data, workouts }
//   depois { action, session, ... } — regras em _shared/forma.ts
import { adminClient, corsHeaders, handleError, HttpError, json } from "../_shared/util.ts";
import * as F from "../_shared/forma.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") return json({ ok: true });
    const b = await req.json().catch(() => ({}));
    const db = adminClient();
    switch (b.action) {
      case "signup": return json(await F.signup(db, b));
      case "login": return json(await F.login(db, b));
      case "logout": return json(await F.logout(db, b.session));
      case "push_key": return json(await F.pushKey(db));
    }
    const u = await F.userBySession(db, b.session);
    switch (b.action) {
      case "me": return json(await F.me(db, u));
      case "save_data": return json(await F.saveData(db, u, b));
      case "profile": return json(await F.saveProfile(db, u, b));
      case "save_workouts": return json(await F.saveWorkouts(db, u, b));
      case "delete_workout": return json(await F.deleteWorkout(db, u, b.id));
      case "ranking": return json(await F.ranking(db, u));
      case "passes": return json(await F.passes(db, u));
      case "challenges": return json(await F.challenges(db, u));
      case "challenge_create": return json(await F.challengeCreate(db, u, b));
      case "challenge_join": return json(await F.challengeJoin(db, u, b.code));
      case "challenge_leave": return json(await F.challengeLeave(db, u, b.code));
      case "push_subscribe": return json(await F.pushSubscribe(db, u, b));
      case "push_off": return json(await F.pushOff(db, u, b.endpoint));
      case "push_test": return json(await F.pushTest(db, u));
    }
    throw new HttpError(400, "Ação desconhecida");
  } catch (e) {
    return handleError(e);
  }
});
