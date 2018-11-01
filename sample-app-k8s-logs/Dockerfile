FROM node:8
WORKDIR /app
RUN curl -L -O https://artifacts.elastic.co/downloads/beats/filebeat/filebeat-6.4.2-amd64.deb && \
    dpkg -i filebeat-6.4.2-amd64.deb && \
    rm -f filebeat-6.4.2-amd64.deb
COPY filebeat.yml /etc/filebeat/filebeat.yml
COPY . .
RUN npm install -no-cache --quiet .
CMD service filebeat start ; npm start
EXPOSE 5000
