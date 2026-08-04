# better-sqlite3 is a native module, so the build stage needs a toolchain and
# the runtime stage must share the same base image for the compiled binding.
FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build \
  # Drop build-only dependencies before they are copied into the runtime image.
  && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    DATA_DIR=/data \
    HOST=0.0.0.0 \
    PORT=3001

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY package.json ./

RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 3001
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/boards').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

# Node strips the types in place; there is no separate compile step for the
# server, which keeps the image to one build artefact (the frontend bundle).
CMD ["node", "--experimental-strip-types", "server/index.ts"]
