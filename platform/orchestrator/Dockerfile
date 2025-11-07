FROM node:20-alpine

# Install Docker CLI
RUN apk add --no-cache docker-cli curl

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3001

CMD ["npm", "run", "dev"]

