FROM node:22-alpine AS builder

RUN apk add --no-cache curl bash ca-certificates

RUN curl -fsSL https://bun.sh/install | bash \
    && mv /root/.bun/bin/bun /usr/local/bin/

WORKDIR /src

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

RUN cd apps/web && bun run build

FROM nginx:1.25-alpine

WORKDIR /usr/share/nginx/html
COPY apps/web/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
    && rm -rf ./*

COPY --from=builder /src/apps/web/out .

EXPOSE 80

ENTRYPOINT [ "/entrypoint.sh" ]
CMD [ "nginx", "-g", "daemon off;" ]

