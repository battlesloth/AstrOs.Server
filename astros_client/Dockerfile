FROM arm64v8/node:18 as build0

WORKDIR /usr/src/commons

RUN npm install typescript -g

COPY ./astros_common/package*.json ./
#RUN npm install && npm install typescript -g

RUN npm ci --production && npm cache clean --force

COPY ./astros_common/ .
RUN tsc

FROM build0 as build1

WORKDIR /usr/src/app

RUN npm install -g @angular/cli

COPY ./astros_client/package*.json ./
RUN npm install

COPY --from=build0 /usr/src/commons/dist /usr/src/app/node_modules/astros-common

COPY ./astros_client/ .
RUN ng build

FROM arm64v8/nginx:alpine-slim AS run

#RUN npm install -g http-server

RUN rm /etc/nginx/conf.d/default.conf 

COPY --from=build1 /usr/src/app/dist/client /usr/share/nginx/html

COPY ./container_files/nginx.conf /etc/nginx/conf.d/default.conf


