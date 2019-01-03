# webhooks-nuxt-demo

> 借助 Webhooks 实现 Vue SSR 项目的自动化部署

## 使用 create-nuxt-app 脚手架创建项目

<img src="https://github.com/HaoChuan9421/webhooks-nuxt-demo/blob/master/assets/preset.png" width="400">

## 可执行脚本

``` bash
# 安装依赖
$ npm install

# 在 localhost:3000 启动一个热更新的本地开发环境
$ npm run dev

# 构建生产环境代码并启动服务
$ npm start

# 生成静态资源
$ npm run generate
```

了解更多：[Nuxt.js docs](https://nuxtjs.org).

## 添加 Webhooks 接口

具体参考 `/server/index.js`，内有详细注释。

## Docker 部署

#### 1. [安装 Docker CE](https://docs.docker.com/install/linux/docker-ce/ubuntu/) (阿里云 Ubuntu 18.04.1 LTS)

#### 2. 部署公钥管理

为私有项目添加部署公钥，使得项目可以在 Docker 中进行代码克隆和后续的拉取更新，[参考链接1](https://gitee.com/help/articles/4181#article-header0)、[参考链接2](https://help.github.com/articles/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent/#generating-a-new-ssh-key)。

1. 生成一个 GitHub 用的 SSH key
    ```bash
    ssh-keygen -t rsa -C 'hc199421@gmail.com' -f ~/.ssh/github_id_rsa
    ```

    <img src="https://github.com/HaoChuan9421/webhooks-nuxt-demo/blob/master/assets/generate_key.png" width="500">

    一般情况下，是不需要使用 `-f ~/.ssh/github_id_rsa` 指定生成的文件，默认生成的文件是 `id_rsa`。但考虑到存在多账号部署或者在一台机器同时使用不同的 git 服务器的可能性，这里对生成的 SSH key 名称进行了自定义。这里的邮箱是你的 GitHub 登录邮箱。

    <img src="https://github.com/HaoChuan9421/webhooks-nuxt-demo/blob/master/assets/ssh_key.png" width="400">
    
2. 在 `~/.ssh` 目录下新建一个 config 文件，添加如下内容。
    ```bash
    # github
    Host github.com
    HostName github.com
    StrictHostKeyChecking no
    PreferredAuthentications publickey
    IdentityFile ~/.ssh/github_id_rsa
    ```
    其中 Host 和 HostName 填写 git 服务器的域名，IdentityFile 指定私钥的路径，StrictHostKeyChecking 指定为 no 可以跳过 (yes/no) 的询问直接克隆，这一点对于 Docker 流畅的创建镜像很有必要，当然你也可以通过执行 `ssh-keyscan github.com > ~/.ssh/known_hosts` 将域名提前添加到 known_hosts。

    <img src="https://github.com/HaoChuan9421/webhooks-nuxt-demo/blob/master/assets/known_hosts.png" width="500">

3. 在项目仓库添加部署公钥

    <img src="https://github.com/HaoChuan9421/webhooks-nuxt-demo/blob/master/assets/add_key.png" width="400"> 

4. 测试公钥是否可用

    ```bash
    ssh -T git@github.com
    ```
    如果出现下图所示内容则表明大功告成，可以执行下一步了。👏👏👏🎉🎉🎉

    <img src="https://github.com/HaoChuan9421/webhooks-nuxt-demo/blob/master/assets/check_key.png" width="500">

#### 3. 创建 Dockerfile
```bash
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
```
#### 4. 创建 Docker Image

通过 `cat` 命令读取之前创建的 SSH 公钥和私钥的内容并作为变量传递给 Docker. build 进行的过程由于需要执行 `git clone` 和 `npm install`，取决于机器和带宽，可能需要花费一定的时间。一个正常的 build 过程如下图。

```bash
docker build \
-t webhooks-nuxt-demo \
--build-arg ssh_prv_key="$(cat ~/.ssh/github_id_rsa)" \
--build-arg ssh_pub_key="$(cat ~/.ssh/github_id_rsa.pub)" \
.
```

<img src="https://github.com/HaoChuan9421/webhooks-nuxt-demo/blob/master/assets/build-image.png" width="400"> 

#### 5. 启动容器
在后台启动容器，并把容器内的 3000 端口 发布到主机的 80 端口。
```bash
sudo docker run -d -p 80:3000 webhooks-nuxt-demo
```
#### 6. 进入执行中的容器

```bash
# 列出所有容器
docker container ls -a
# 进入指定的容器中
docker exec -i -t 容器名称或者容器ID bash
```
