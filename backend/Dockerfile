# Stage 1: Build
FROM node:20-alpine as builder

WORKDIR /app

# Install OpenSSL
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm install

COPY . .
# Generate Prisma Client before build
RUN npx prisma generate
RUN npm run build

# Stage 2: Run
FROM node:20-alpine

WORKDIR /app

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm install --production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Generate Prisma Client
RUN npx prisma generate

EXPOSE 3000

CMD ["npm", "start"]
