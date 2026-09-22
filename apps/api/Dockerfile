FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6
WORKDIR /app
RUN npm install -g pnpm@11.27.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm typecheck
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=3001
EXPOSE 3001
CMD ["pnpm", "exec", "tsx", "apps/api/src/main.ts"]
