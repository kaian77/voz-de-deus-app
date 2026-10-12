#!/bin/bash
# Instala o WAHA (WhatsApp grátis) num servidor "Always Free" da Oracle Cloud, já com HTTPS.
# Uso: cole este arquivo inteiro em "Script de inicialização (cloud-init)" ao criar a instância Ubuntu.
# ANTES de colar, troque a SENHA abaixo (só letras e números, 20+ caracteres).
# Ela vira a chave de API do WAHA e a senha do painel (usuário: admin).
SENHA="TroqueEstaSenhaPorUmaBemGrande2026"

set -eux
export DEBIAN_FRONTEND=noninteractive

# Libera 80/443 no firewall interno da imagem Ubuntu da Oracle (bloqueia tudo por padrão)
iptables -I INPUT 5 -p tcp --dport 80 -j ACCEPT
iptables -I INPUT 5 -p tcp --dport 443 -j ACCEPT
netfilter-persistent save || true

apt-get update
apt-get install -y docker.io docker-compose-v2 curl

# Endereço https grátis: 1-2-3-4.sslip.io aponta para o IP 1.2.3.4
IP=$(curl -fsS https://api.ipify.org)
HOST="$(echo "$IP" | tr . -).sslip.io"

# Imagem leve (motor GOWS), para ARM (Ampere) ou x86 (Micro)
if [ "$(uname -m)" = "aarch64" ]; then IMAGE=devlikeapro/waha:gows-arm; else IMAGE=devlikeapro/waha:gows; fi

mkdir -p /opt/waha && cd /opt/waha
cat > .env <<EOF
WAHA_API_KEY=$SENHA
WAHA_DASHBOARD_USERNAME=admin
WAHA_DASHBOARD_PASSWORD=$SENHA
WHATSAPP_SWAGGER_USERNAME=admin
WHATSAPP_SWAGGER_PASSWORD=$SENHA
WHATSAPP_DEFAULT_ENGINE=GOWS
WAHA_BASE_URL=https://$HOST
WHATSAPP_RESTART_ALL_SESSIONS=True
EOF

cat > Caddyfile <<EOF
$HOST {
  reverse_proxy waha:3000
}
EOF

cat > docker-compose.yml <<EOF
services:
  waha:
    image: $IMAGE
    restart: always
    env_file: .env
    volumes:
      - ./sessions:/app/.sessions
      - ./media:/app/.media
    logging: { driver: json-file, options: { max-size: 50m, max-file: "3" } }
  caddy:
    image: caddy:2
    restart: always
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - ./caddy:/data
EOF

docker compose up -d
echo "WAHA no ar: https://$HOST/dashboard" > /opt/waha/ENDERECO.txt
