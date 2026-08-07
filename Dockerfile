# better-sqlite3 ships a prebuilt binding and compiles nothing here, so the base
# image is chosen for its glibc: the linux-arm64 prebuild needs >= 2.38, which
# rules out bookworm (2.36). Trixie has 2.41. Both stages stay on it so the
# binding npm downloads in the build stage still loads in the runtime stage.
FROM node:22-trixie-slim AS build
WORKDIR /app

# npm still invokes `node-gyp rebuild` on install, and node-gyp needs Python to
# evaluate binding.gyp even though that file resolves to a no-op target once it
# detects the prebuild. Without these, `npm ci` fails outright.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build \
  # Drop build-only dependencies before they are copied into the runtime image.
  && npm prune --omit=dev

FROM node:22-trixie-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    DATA_DIR=/data \
    HOST=0.0.0.0 \
    PORT=3001

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY package.json ./

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN mkdir -p /data && chown -R node:node /data /app && chmod +x /usr/local/bin/entrypoint.sh

# Deliberately no `USER node`: the entrypoint starts as root purely to fix the
# ownership of a bind-mounted /data, then drops to node before exec'ing the
# server. Given its own name so it does not shadow the node image's entrypoint.
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

EXPOSE 3001
VOLUME ["/data"]

# Runs as root, since HEALTHCHECK has no user field and the image no longer
# pins one. It only performs a fetch, so that costs nothing.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/boards').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

# Node strips the types in place; there is no separate compile step for the
# server, which keeps the image to one build artefact (the frontend bundle).
CMD ["node", "--experimental-strip-types", "server/index.ts"]
