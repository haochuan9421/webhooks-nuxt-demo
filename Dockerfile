FROM node:8

ARG username

ARG password

RUN mkdir -p /home/webhooks-nuxt-demo

WORKDIR /home/webhooks-nuxt-demo

RUN git clone https://${username}:${password}@github.com/HaoChuan9421/webhooks-nuxt-demo.git .

RUN npm install

EXPOSE 3000

CMD npm start