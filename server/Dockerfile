# Use Node.js LTS
FROM node:18-alpine

# Install dependencies for Prisma
RUN apk add --no-cache openssl

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm install

# Generate Prisma Client (legacy schema)
RUN npx prisma generate

# Generate Prisma Client for NEW schema (outputs to node_modules/.prisma/new-client)
RUN npx prisma generate --schema prisma/new-schema.prisma

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Start the server with tsx (TypeScript execution)
CMD ["npx", "tsx", "src/index.ts"] 