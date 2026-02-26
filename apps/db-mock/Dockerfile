FROM node:22-alpine
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src ./src
RUN npm run build
ENV PORT=4010
EXPOSE 4010
CMD ["npm", "run", "start"]
