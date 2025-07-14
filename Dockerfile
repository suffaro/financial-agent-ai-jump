FROM node:22-alpine

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

COPY package*.json ./
COPY client/package*.json ./client/

COPY . .

RUN npm ci

WORKDIR /app/client
RUN npm ci

WORKDIR /app

RUN npx prisma generate

RUN npm run build

RUN adduser -S -u 1001 appuser && \
    chown -R appuser /app
USER appuser

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["npm", "start"]
