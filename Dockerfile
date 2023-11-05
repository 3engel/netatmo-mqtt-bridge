FROM node:lts-alpine
ENV NODE_ENV=production
WORKDIR /usr/src/app
COPY ["package.json", "package-lock.json*", "npm-shrinkwrap.json*", "./"]
RUN npm install --production --silent && mv node_modules ../
COPY . .
RUN chown -R node app.js
RUN touch last_refreshtoken.txt
RUN chown -R node last_refreshtoken.txt
USER node
CMD ["npm", "start"]