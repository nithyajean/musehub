# MuseHub server image. Runs the composition root (REST + MCP on one port) with a
# real git binary. Build tools are present because the SQLite and ssh2 adapters
# compile native addons at install time.
FROM node:22-bookworm

# git is the backend; build-essential and python3 build the native deps.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git build-essential python3 ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@11.25.0 --activate

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

ENV NODE_ENV=production
ENV MUSEHUB_HOST=0.0.0.0
ENV PORT=7700
# Where the SQLite file and bare git repos live. Mount a volume here to persist.
ENV MUSEHUB_DATA_DIR=/data
EXPOSE 7700

# The server start script runs the TypeScript entrypoint with tsx.
CMD ["pnpm", "--filter", "@musehub/server", "start"]
