# ---------------------- Build Stage ----------------------
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for building)
RUN npm ci

# Copy source files
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# ---------------------- Production Stage ----------------------
FROM node:20-slim AS production

# Install system dependencies:
# - LibreOffice for DOCX->PDF conversion
RUN apt-get update && apt-get install -y --no-install-recommends \
    # LibreOffice (headless)
    libreoffice \
    # CA certificates for HTTPS
    ca-certificates \
    # Clean up
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Set environment variables for binaries
ENV LIBREOFFICE_BIN=/usr/bin/soffice

# Create non-root user for security
RUN groupadd -r accuraai && useradd -r -g accuraai accuraai

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Create logs directory
RUN mkdir -p logs && chown -R accuraai:accuraai /app

# Switch to non-root user
USER accuraai

# Expose the application port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

# Start the application
CMD ["node", "dist/server.js"]