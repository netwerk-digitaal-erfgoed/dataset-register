FROM node:lts-alpine
LABEL org.opencontainers.image.source="https://github.com/netwerk-digitaal-erfgoed/dataset-register"

WORKDIR /app

COPY build/package*.json ./
RUN npm ci --omit=dev

COPY build build/

EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "build"]
