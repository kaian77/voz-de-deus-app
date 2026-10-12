#!/usr/bin/env bash
# Instala/atualiza o backend do Studio num projeto Supabase usando só um Access Token.
# Usado pelo GitHub Actions (.github/workflows/supabase-deploy.yml); idempotente.
#
# Variáveis: SUPABASE_ACCESS_TOKEN (obrigatória), SUPABASE_PROJECT_NAME, APP_URL
set -euo pipefail

API=https://api.supabase.com/v1
: "${SUPABASE_ACCESS_TOKEN:?Crie o secret SUPABASE_ACCESS_TOKEN no GitHub (Settings > Secrets and variables > Actions)}"
PROJECT_NAME="${SUPABASE_PROJECT_NAME:-supabase-citron-window}"
APP_URL="${APP_URL:-https://voz-de-deus-app.vercel.app}"

api() { # api METHOD PATH [JSON]
  local method=$1 path=$2 body=${3:-}
  local out code
  out=$(mktemp)
  code=$(curl -sS -o "$out" -w '%{http_code}' -X "$method" "$API$path" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
    ${body:+--data "$body"})
  if [[ $code -ge 300 ]]; then
    echo "::error::$method $path -> HTTP $code: $(cat "$out")" >&2
    return 1
  fi
  cat "$out"
}

sql() { # sql "<query>"  (roda no banco como postgres)
  api POST "/projects/$REF/database/query" "$(jq -n --arg q "$1" '{query: $q}')"
}

echo "==> Procurando o projeto \"$PROJECT_NAME\""
REF=$(api GET /projects | jq -r --arg n "$PROJECT_NAME" '.[] | select(.name == $n) | .id' | head -1)
if [[ -z $REF ]]; then
  echo "::error::Projeto \"$PROJECT_NAME\" não encontrado. Projetos disponíveis:"
  api GET /projects | jq -r '.[] | "  - \(.name) (\(.status))"'
  exit 1
fi
STATUS=$(api GET "/projects/$REF" | jq -r .status)
echo "    ref=$REF status=$STATUS"
if [[ $STATUS != ACTIVE_HEALTHY ]]; then
  echo "::error::O projeto está \"$STATUS\". Reative-o no painel do Supabase e rode de novo."
  exit 1
fi
FUNCTIONS_URL="https://$REF.supabase.co/functions/v1"

echo "==> Extensões"
sql "create extension if not exists pg_cron with schema pg_catalog; create extension if not exists pg_net with schema extensions;" >/dev/null

echo "==> Migrations"
for f in supabase/migrations/*.sql; do
  echo "    $f"
  sql "$(cat "$f")" >/dev/null
done

echo "==> Login (endereço do site)"
# Cadastro público fica FECHADO (só o dono usa o Studio). Para liberar novos cadastros,
# crie a variable ALLOW_SIGNUP=true no GitHub e rode o workflow.
DISABLE_SIGNUP=true; [[ ${ALLOW_SIGNUP:-} == true ]] && DISABLE_SIGNUP=false
api PATCH "/projects/$REF/config/auth" "$(jq -n --arg u "$APP_URL" --argjson d "$DISABLE_SIGNUP" \
  '{site_url: $u, uri_allow_list: ($u + "/**"), disable_signup: $d, password_min_length: 8}')" >/dev/null
echo "    cadastro público: $([[ $DISABLE_SIGNUP == true ]] && echo fechado || echo aberto)"

echo "==> Secrets das funções"
EXISTING=$(api GET "/projects/$REF/secrets" | jq -r '.[].name')
has() { grep -qx "$1" <<<"$EXISTING"; }
NEW='[]'
add() { NEW=$(jq --arg n "$1" --arg v "$2" '. + [{name: $n, value: $v}]' <<<"$NEW"); }
add APP_URL "$APP_URL"
has OAUTH_STATE_SECRET || add OAUTH_STATE_SECRET "$(openssl rand -hex 32)"
add META_VERIFY_TOKEN "${META_VERIFY_TOKEN:-voz-de-deus-studio}"

# Chaves dos apps (vêm dos secrets do GitHub; só são enviadas quando preenchidas)
for name in IG_APP_ID IG_APP_SECRET TIKTOK_CLIENT_KEY TIKTOK_CLIENT_SECRET NUVEMSHOP_APP_ID NUVEMSHOP_CLIENT_SECRET ANTHROPIC_API_KEY CLAUDE_MODEL \
            ML_APP_ID ML_CLIENT_SECRET SHOPEE_PARTNER_ID SHOPEE_PARTNER_KEY \
            WHATSAPP_APP_SECRET META_FB_ACCESS_TOKEN META_FB_IG_USER_ID; do
  [[ -n ${!name:-} ]] && add "$name" "${!name}"
done

# O cron precisa conhecer o CRON_SECRET; como o valor salvo não pode ser lido de volta,
# geramos um novo (e reagendamos o job) quando o secret ou o job não existem.
JOB=$(sql "select count(*)::int as n from cron.job where jobname = 'publicar-posts'" | jq -r '.[0].n')
if ! has CRON_SECRET || [[ $JOB == 0 ]]; then
  CRON_SECRET=$(openssl rand -hex 32)
  add CRON_SECRET "$CRON_SECRET"
fi
api POST "/projects/$REF/secrets" "$NEW" >/dev/null
echo "    $(jq -r 'map(.name) | join(", ")' <<<"$NEW")"

echo "==> Edge functions"
supabase functions deploy --project-ref "$REF" --use-api || supabase functions deploy --project-ref "$REF"

if [[ -n ${CRON_SECRET:-} ]]; then
  echo "==> Agendador (a cada minuto)"
  sql "select cron.unschedule(jobid) from cron.job where jobname = 'publicar-posts';" >/dev/null
  sql "select cron.schedule('publicar-posts', '* * * * *', \$cron\$
    select net.http_post(
      url := '$FUNCTIONS_URL/publish-scheduled',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '$CRON_SECRET'),
      body := '{}'::jsonb
    );
  \$cron\$);" >/dev/null
fi

echo "==> Teste"
TABLES=$(sql "select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name in ('posts','automations','conversations','messages','brand_settings','api_keys')" | jq -r '.[0].n')
echo "    tabelas do Studio: $TABLES/6"
AGENT=$(curl -sS "$FUNCTIONS_URL/agent" || true)
echo "    função agent: $AGENT"
CRON=$(sql "select count(*)::int as n from cron.job where jobname = 'publicar-posts'" | jq -r '.[0].n')
echo "    agendador: $CRON job(s)"
[[ $TABLES == 6 ]] && jq -e '.ok == true' <<<"$AGENT" >/dev/null && [[ $CRON == 1 ]]
echo "Tudo pronto: $APP_URL/studio"
