# Description:  Builds a production image from the Next.js standalone output and runs it as an
#               unprivileged user.
# Author:       Alex Wu
# Dependencies: Node.js 24
# Usage:        docker build -t secret-santa-bot-ultimate .
FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 santa && adduser --system --uid 1001 --ingroup santa santa
COPY --from=builder --chown=santa:santa /app/.next/standalone ./
COPY --from=builder --chown=santa:santa /app/.next/static ./.next/static
USER santa
EXPOSE 3000
CMD ["node", "server.js"]
