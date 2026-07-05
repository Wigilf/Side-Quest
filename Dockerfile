# Portable image for the Side Quest backend (Fly.io, Railway, Cloud Run, any
# container host). The server has zero npm dependencies, so we copy only server/.
FROM node:22-alpine
WORKDIR /app
COPY server ./server
ENV PORT=8787
EXPOSE 8787
# Keys (ANTHROPIC_API_KEY, GOOGLE_API_KEY) and ALLOW_ORIGIN are injected as
# runtime env vars by the host — never baked into the image.
CMD ["node", "server/index.mjs"]
