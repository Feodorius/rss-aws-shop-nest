# syntax=docker/dockerfile:1.6

# ---- builder ----
FROM node:20-alpine AS builder
WORKDIR /app

# Install all deps (incl. devDeps) for the TypeScript build
COPY package*.json ./
RUN npm install --no-audit --no-fund

# Compile sources
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

# Trim node_modules to production-only for the runner stage
RUN npm prune --omit=dev


# ---- runner ----
FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

# Reuse pre-pruned production dependencies from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

EXPOSE 80
CMD ["node", "dist/main.js"]
