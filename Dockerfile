# 添加 node 镜像，:8 是指定 node 的版本，默认会拉取最新的
FROM node:8
# 定义 SSH 私钥变量
ARG ssh_prv_key
# 定义 SSH 公钥变量
ARG ssh_pub_key
# 在 /home 下创建名为 webhooks-nuxt-demo 的文件夹
RUN mkdir -p /home/webhooks-nuxt-demo
# 为 RUN, CMD 等命令指定工作区
WORKDIR /home/webhooks-nuxt-demo
# 创建 .ssh 目录
RUN mkdir -p /root/.ssh
# 生成 github_id_rsa、github_id_rsa.pub 和 config 文件
RUN echo "$ssh_prv_key" > /root/.ssh/github_id_rsa && \
    echo "$ssh_pub_key" > /root/.ssh/github_id_rsa.pub && \
    echo "Host github.com\nHostName github.com\nStrictHostKeyChecking no\nPreferredAuthentications publickey\nIdentityFile /root/.ssh/github_id_rsa" > /root/.ssh/config
# 修改私钥的用户权限
RUN chmod 600 /root/.ssh/github_id_rsa
# 克隆远端 git 仓库代码到工作区，注意最后的 . 不能省略
RUN git clone git@github.com:HaoChuan9421/webhooks-nuxt-demo.git .
# 安装依赖
RUN npm install
# 对外暴露 3000 端口
EXPOSE 3000
# 启动时的执行脚本
CMD npm start