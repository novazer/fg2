ARG DOCKER_NODE_WEBAPP_IMAGE
ARG DOCKER_NGINX_IMAGE

### STAGE 1: Build ###
FROM ${DOCKER_NODE_WEBAPP_IMAGE} AS build
RUN apk add perl
WORKDIR /usr/src/app
COPY package.json package-lock.json ./
RUN npm install
ARG API_URL_EXTERNAL
COPY . .
RUN cp src/environments/environment.prod.ts src/environments/environment.prod.ts.tmpl \
    && perl -p -e 's/#API_URL_EXTERNAL#/$ENV{API_URL_EXTERNAL}/g' src/environments/environment.prod.ts.tmpl > src/environments/environment.prod.ts \
    && rm src/environments/environment.prod.ts.tmpl
RUN npm run build

### STAGE 2: Run ###
FROM ${DOCKER_NGINX_IMAGE}

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /usr/src/app/www /app
