FROM node:lts-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN NODE_ENV=production npm run compile

FROM node:lts-alpine
LABEL org.opencontainers.image.source="https://github.com/netwerk-digitaal-erfgoed/dataset-register"
ENV NODE_ENV=production
WORKDIR /app/
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY --from=build /app/build/src /app/build/src
COPY --from=build /app/shacl /app/shacl
COPY --from=build /app/assets /app/assets
USER node
CMD ["npm", "start"]
EXPOSE 3000
