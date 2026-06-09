# GCP staging CI entrypoint. Canonical copy: deploy/docker/nats-js/Dockerfile

FROM nats:2.10-alpine

COPY docs/railway/nats-js/nats-server.conf /etc/nats/nats-server.conf

EXPOSE 4222 8222 6222

CMD ["-c", "/etc/nats/nats-server.conf"]
