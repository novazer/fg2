### STAGE 1: Build ###
FROM node:16-alpine AS build
RUN apk add perl
WORKDIR /usr/src/app
COPY package.json package-lock.json ./
RUN npm install
ARG API_URL_EXTERNAL
COPY . .
RUN perl -p -e 's/#API_URL_EXTERNAL#/$ENV{API_URL_EXTERNAL}/g' src/environments/environment.prod.ts.tmpl > src/environments/environment.prod.ts
RUN npm run build

### STAGE 2: Run ###
FROM nginx:1.17.1-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /usr/src/app/www /app
