FROM --platform=linux/arm64 arm64v8/node:20 as build0

WORKDIR /usr/src/commons

RUN npm install typescript -gcc

COPY ./astros_common/package*.json ./

RUN npm ci --production && npm cache clean --force

COPY ./astros_common/ .
RUN tsc

FROM build0 as build1

WORKDIR /usr/src/app

COPY ./astros_api/package*.json ./

RUN npm install --python=/usr/bin/python3

COPY --from=build0 /usr/src/commons/dist ./node_modules/astros-common

COPY ./astros_api/ .

RUN tsc

COPY ./container_files/.env ./dist

WORKDIR /usr/src/app/dist

FROM build1 as build2

WORKDIR /usr/src/temp/

COPY --from=build1 /usr/src/app/dist /usr/src/temp/
COPY --from=build1 /usr/src/app/package*.json /usr/src/temp/

RUN npm install sqlite3 --python=/usr/bin/python3
RUN npm install bufferutil
RUN npm install utf-8-validate
RUN npm install serialport

FROM --platform=arm64 gcr.io/distroless/nodejs20-debian11

WORKDIR /app

COPY --from=build2 /usr/src/temp .
COPY --from=build0 /usr/src/commons/dist ./node_modules/astros-common

EXPOSE 3000
EXPOSE 5000

CMD ["api_server.js"]
