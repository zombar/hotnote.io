# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application and extract version
RUN npm run build && \
    node -p "require('./package.json').version" > /app/VERSION

# Extract version from package.json
RUN node -p "require('./package.json').version" > /app/VERSION

# Production stage
FROM nginx:alpine

# Add Docker labels for metadata
ARG BUILD_DATE
ARG VCS_REF
COPY --from=builder /app/VERSION /tmp/VERSION
RUN APP_VERSION=$(cat /tmp/VERSION) && \
    echo "org.opencontainers.image.version=${APP_VERSION}"

LABEL org.opencontainers.image.title="hotnote" \
      org.opencontainers.image.description="A lightweight, minimalistic code editor and note-taking app" \
      org.opencontainers.image.vendor="hotnote.io"

# Copy version file and set as environment variable for nginx
COPY --from=builder /app/VERSION /app/VERSION
RUN echo "export APP_VERSION=$(cat /app/VERSION)" > /etc/profile.d/app-version.sh

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

# Start nginx with environment variable substitution
CMD ["/bin/sh", "-c", "export APP_VERSION=$(cat /app/VERSION) && envsubst '$APP_VERSION' < /etc/nginx/conf.d/default.conf > /tmp/default.conf && mv /tmp/default.conf /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
