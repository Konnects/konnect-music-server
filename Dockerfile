# using alpine version of node for less image size
FROM node:16-alpine3.16

# creating work directory in image file
WORKDIR /app

# copying package json and lock json from current dir to image [WORKDIR] (as mentioned above)  
COPY package*.json ./

# running npm install command to install all packages from package.json file
RUN npm install

# copying the all files and folders from current dir to [WORKDIR] except mentioned in .dockerignore
COPY . .

# Setting envirnoment variable
# ENV PORT=8787

# Exposing port 8080 for image 
EXPOSE 9999

# running node server
CMD [ "npm", "start" ]