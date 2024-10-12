FROM node:22-alpine3.20

WORKDIR /app

COPY lib /app/lib
COPY package.json /app/
COPY index.ts /app/
COPY declaration.d.ts /app/
COPY package-lock.json /app/
COPY yarn.lock /app/
COPY tsconfig.json /app/

VOLUME [ "/app/config.json" ]
VOLUME [ "/app/spotifyKeys.json" ]

RUN npm update && npm install yarn
RUN yarn install

CMD [ "yarn", "start" ]