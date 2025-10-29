# Common build stage
FROM node:14.20.0-alpine3.16 as common-build-stage

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
