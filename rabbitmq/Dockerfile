ARG DOCKER_RABBITMQ_IMAGE

FROM ${DOCKER_RABBITMQ_IMAGE}
RUN rabbitmq-plugins enable rabbitmq_mqtt rabbitmq_auth_backend_http
ADD rabbitmq.conf /etc/rabbitmq/conf.d/rabbitmq.conf
COPY docker-entrypoint-wrapper.sh /usr/local/bin/docker-entrypoint-wrapper.sh
RUN chmod +x /usr/local/bin/docker-entrypoint-wrapper.sh \
 && chown rabbitmq:rabbitmq /etc/rabbitmq/conf.d/rabbitmq.conf
ENTRYPOINT ["/usr/local/bin/docker-entrypoint-wrapper.sh"]
CMD ["rabbitmq-server"]

