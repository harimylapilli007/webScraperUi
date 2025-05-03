# Use Node.js LTS version
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Set environment variables
ENV NEXT_PUBLIC_API_URL=http://localhost:5000
ENV NEXT_PUBLIC_SOCKET_URL=http://localhost:5000

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the application code
COPY . .

# Build the application
RUN npm run build

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["npm", "start"] 