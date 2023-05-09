FROM node:16-bullseye as build
WORKDIR /usr/src/app
# Do `npm ci` separately so we can cache `node_modules`
# https://nodejs.org/en/docs/guides/nodejs-docker-webapp/
COPY package.json package-lock.json ./
RUN npm clean-install
COPY . .
RUN npm run build

FROM node:16-bullseye-slim
WORKDIR /usr/src/app
COPY --from=build /usr/src/app/node_modules node_modules
COPY --from=build /usr/src/app/dist dist
COPY package.json ./
ENV PG_META_PORT=8080
ENV PG_META_HOST="fly-local-6pn" \
    PG_META_DB_HOST="[fdaa:2:21ef:a7b:f8:866b:2e30:2]" \
    PG_META_DB_PORT=5432 \
    PG_META_DB_NAME=postgres \
    PG_META_DB_PASSWORD=password
ENV PG_META_HOST="fly-local-6pn"
CMD ["npm", "run", "start", "--", "-H", "fly-local-6pn"]
EXPOSE 8080
# --start-period defaults to 0s, but can't be set to 0s (to be explicit) by now
HEALTHCHECK --interval=5s --timeout=5s --retries=3 CMD node -e "require('http').get('http://localhost:8080/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"
