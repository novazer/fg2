ARG DOCKER_NODE_SERVER_IMAGE

# Common build stage
FROM ${DOCKER_NODE_SERVER_IMAGE} as common-build-stage

RUN mkdir -p /app
COPY package.json /app
COPY package-lock.json /app
WORKDIR /app


RUN rm -rf node_modules
RUN rm -rf dist
#RUN rm -rf package-lock.json
RUN npm cache clean --force
RUN npm install

COPY . /app
EXPOSE 3000

ENV NODE_ENV production

CMD ["npm", "run", "start"]
