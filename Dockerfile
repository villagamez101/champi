FROM oven/bun:1-alpine

WORKDIR /app

COPY app/package.json ./
RUN bun install --production

COPY app/ ./

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
VOLUME ["/data"]

CMD ["bun", "run", "index.ts"]
