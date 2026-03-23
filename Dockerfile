# Build Vue client
FROM --platform=linux/arm64/v8 docker.io/arm64v8/node:20-slim as build-vue

WORKDIR /usr/src/vue

# Needed for node-gyp when native modules are installed on slim images.
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

COPY ./astros_vue/package*.json ./
RUN npm ci

COPY ./astros_vue/ .
RUN npm run build

# Build API backend
FROM build-vue as build-api

WORKDIR /usr/src/app

COPY ./astros_api/package*.json ./

RUN npm ci --python=/usr/bin/python3 && npm install typescript -g

COPY ./astros_api/ .
RUN tsc

ARG JWT_KEY
RUN printf '%s\n' \
  "JWT_KEY=${JWT_KEY}" \
  "DATABASE_PATH=%AppData%" \
  "API_PORT=3000" \
  "WEBSOCKET_PORT=5000" \
  "SERIAL_PORT=/dev/ttyS0" \
  "BAUD_RATE=115200" \
  > ./dist/.env

# Install production dependencies for API
FROM build-api as build-api-prod

WORKDIR /usr/src/temp/

COPY --from=build-api /usr/src/app/dist /usr/src/temp/
COPY --from=build-api /usr/src/app/package*.json /usr/src/temp/

RUN npm ci --omit=dev --python=/usr/bin/python3 && npm cache clean --force

# Final stage: nginx + node
FROM --platform=linux/arm64/v8 docker.io/arm64v8/node:20-slim

# Install nginx
RUN apt-get update && \
    apt-get install -y --no-install-recommends nginx && \
    rm -rf /var/lib/apt/lists/* && \
    rm -f /etc/nginx/sites-enabled/default

# Copy Vue build to nginx html directory
COPY --from=build-vue /usr/src/vue/dist /usr/share/nginx/html

# Copy nginx config
COPY ./container_files/nginx.conf /etc/nginx/sites-available/default
RUN ln -s /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default

# Set up API
WORKDIR /app

COPY --from=build-api-prod /usr/src/temp .

# Create start script
RUN echo '#!/bin/bash' > /start.sh && \
    echo 'service nginx start' >> /start.sh && \
    echo 'exec node api_server.js' >> /start.sh && \
    chmod +x /start.sh

EXPOSE 80
EXPOSE 3000
EXPOSE 5000

CMD ["/start.sh"]
