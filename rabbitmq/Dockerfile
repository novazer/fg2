ARG DOCKER_RABBITMQ_IMAGE

FROM ${DOCKER_RABBITMQ_IMAGE}
RUN rabbitmq-plugins enable rabbitmq_mqtt rabbitmq_auth_backend_http
ADD rabbitmq.conf /etc/rabbitmq/conf.d/rabbitmq.conf
