FROM alpine:3.21
RUN apk add --no-cache g++ coreutils
USER 65534:65534
WORKDIR /tmp
