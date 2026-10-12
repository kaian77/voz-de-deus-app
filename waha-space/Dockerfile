# WAHA (WhatsApp grátis) para rodar num Space Docker do Hugging Face (grátis, sem cartão).
# No Space: crie este arquivo como "Dockerfile" e cadastre em Settings > Variables and secrets:
#   WAHA_API_KEY, WAHA_DASHBOARD_PASSWORD e WHATSAPP_SWAGGER_PASSWORD (a mesma senha forte nos três).
FROM devlikeapro/waha:gows

ENV WHATSAPP_API_PORT=7860 \
    WHATSAPP_DEFAULT_ENGINE=GOWS \
    WHATSAPP_START_SESSION=default \
    WHATSAPP_RESTART_ALL_SESSIONS=True \
    WAHA_DASHBOARD_USERNAME=admin \
    WHATSAPP_SWAGGER_USERNAME=admin

# O Hugging Face roda o container com o usuário 1000: libera as pastas de sessão e mídia
USER root
RUN mkdir -p /app/.sessions /app/.media && chmod -R 777 /app/.sessions /app/.media

EXPOSE 7860
