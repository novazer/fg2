ARG DOCKER_NODE_SERVER_IMAGE

# Common build stage
FROM ${DOCKER_NODE_SERVER_IMAGE} as common-build-stage

RUN apk add --no-cache ffmpeg imagemagick

WORKDIR /app

COPY shared-types ./shared-types
COPY server/package.json server/package-lock.json ./server/
WORKDIR /app/server


RUN rm -rf node_modules
RUN rm -rf dist
#RUN rm -rf package-lock.json
RUN npm cache clean --force
RUN npm install

COPY server/ .
EXPOSE 3000

ENV NODE_ENV production

CMD ["npm", "run", "start"]
