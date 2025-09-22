# Use the official Node.js image as the base image
FROM node:20

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json into the container
COPY package.json package-lock.json ./

# Install project dependencies (use npm install to allow updated package.json)
RUN npm install --omit=dev

# Copy the rest of the project files into the container
COPY . .

# Expose the port the app runs on (internal, fronted by Nginx)
EXPOSE 10010

# Command to run your Node.js app
CMD ["node", "index.js"]
