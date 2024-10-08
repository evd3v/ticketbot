# Use the official Node.js image as the base image
FROM node:20

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json into the container
COPY package.json package-lock.json ./

# Install project dependencies
RUN npm ci

# Copy the rest of the project files into the container
COPY . .

# Expose the port the app runs on (if needed)
EXPOSE 10000

# Command to run your Node.js app
CMD ["node", "index.js"]
