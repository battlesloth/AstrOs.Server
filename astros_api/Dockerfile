FROM arm64v8/node:18 as build0

WORKDIR /usr/src/commons

RUN npm install typescript -g

COPY ./astros_common/package*.json ./

RUN npm ci --production && npm cache clean --force

COPY ./astros_common/ .
RUN tsc

#FROM node:lts-bullseye-slim as run
FROM build0 as build1

WORKDIR /usr/src/app

COPY ./astros_api/package*.json ./

RUN npm install --omit=dev --python=/usr/bin/python3 && npm cache clean --force

COPY --from=build0 /usr/src/commons/dist ./node_modules/astros-common

# we pull from dist instead of building in a container because
# we are currently using powershell to fix paths in the typescript includes
# I'm sure plenty of people won't like this, but I have other issues to resolve
# that are higher priority. Feel free to make a pull request changing this
COPY ./astros_api/dist .
RUN rm -f ./.env
COPY ./container_files/.env .

FROM --platform=arm64 gcr.io/distroless/nodejs18-debian11

COPY --from=build1 /usr/src/app /app
COPY --from=build0 /usr/src/commons/dist /app/node_modules/astros-common

WORKDIR /app

EXPOSE 3000
EXPOSE 5000

#CMD [ "node", "api_server.js"]
CMD ["api_server.js"]
