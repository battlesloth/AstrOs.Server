# Build astros_common
FROM --platform=linux/arm64 arm64v8/node:20 as build-common

WORKDIR /usr/src/commons

RUN npm install typescript -g

COPY ./astros_common/package*.json ./
RUN npm ci --production && npm cache clean --force

COPY ./astros_common/ .
RUN tsc

# Build Vue frontend
FROM build-common as build-vue

WORKDIR /usr/src/vue

COPY ./astros_vue/package*.json ./
RUN npm install

COPY --from=build-common /usr/src/commons/dist /usr/src/vue/node_modules/astros-common

COPY ./astros_vue/ .
RUN npm run build

# Build API backend
FROM build-common as build-api

WORKDIR /usr/src/app

COPY ./astros_api/package*.json ./
RUN npm install --python=/usr/bin/python3

COPY --from=build-common /usr/src/commons/dist ./node_modules/astros-common

COPY ./astros_api/ .
RUN tsc

COPY ./container_files/.env ./dist

# Install production dependencies for API
FROM build-api as build-api-prod

WORKDIR /usr/src/temp/

COPY --from=build-api /usr/src/app/dist /usr/src/temp/
COPY --from=build-api /usr/src/app/package*.json /usr/src/temp/

RUN npm install sqlite3 --python=/usr/bin/python3
RUN npm install bufferutil
RUN npm install utf-8-validate
RUN npm install serialport

# Final stage: nginx + node
FROM --platform=linux/arm64 arm64v8/node:20

# Install nginx
RUN apt-get update && \
    apt-get install -y nginx && \
    rm -rf /var/lib/apt/lists/*

# Set up nginx
RUN rm -f /etc/nginx/sites-enabled/default

# Copy Vue build to nginx html directory
COPY --from=build-vue /usr/src/vue/dist /usr/share/nginx/html

# Copy nginx config
COPY ./container_files/nginx.conf /etc/nginx/sites-available/default
RUN ln -s /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default

# Set up API
WORKDIR /app

COPY --from=build-api-prod /usr/src/temp .
COPY --from=build-common /usr/src/commons/dist ./node_modules/astros-common

# Create start script
RUN echo '#!/bin/bash' > /start.sh && \
    echo 'service nginx start' >> /start.sh && \
    echo 'exec node api_server.js' >> /start.sh && \
    chmod +x /start.sh

EXPOSE 80
EXPOSE 3000
EXPOSE 5000

CMD ["/start.sh"]
