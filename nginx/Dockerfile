FROM nginx:1.25-alpine

# Copy Nginx config
COPY nginx/nginx.conf /etc/nginx/nginx.conf

# Copy Mini App assets into the image
COPY webapp/ /usr/share/nginx/html/webapp/

EXPOSE 80
