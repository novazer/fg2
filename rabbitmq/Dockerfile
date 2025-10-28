FROM rabbitmq:3.8-management
RUN rabbitmq-plugins enable rabbitmq_mqtt rabbitmq_auth_backend_http
ADD rabbitmq.conf /etc/rabbitmq/conf.d/rabbitmq.conf
