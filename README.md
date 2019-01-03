# webhooks-nuxt-demo

> 借助 Webhooks 实现 Vue SSR 项目的自动化部署

## 使用 create-nuxt-app 脚手架创建项目

<img src="https://github.com/HaoChuan9421/webhooks-nuxt-demo/blob/master/assets/preset.png" width="200">

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

#### 2. 创建 Dockerfile
```bash
# 添加 node 镜像，:8 是指定 node 的版本，默认是最新的
FROM node:8
# 定义登录远端 git 仓库的用户名变量
ARG username
# 定义登录远端 git 仓库的密码变量
ARG password
# 在 /home 下创建名为 webhooks-nuxt-demo 的文件夹
RUN mkdir -p /home/webhooks-nuxt-demo
# 为 RUN, CMD 等命令指定工作区
WORKDIR /home/webhooks-nuxt-demo
# 克隆远端 git 仓库代码到工作区，注意最后的 . 不能省略
RUN git clone https://${username}:${password}@github.com/HaoChuan9421/webhooks-nuxt-demo.git .
# 安装依赖
RUN npm install
# 对外暴露 3000 端口
EXPOSE 3000
# 启动时的执行脚本
CMD npm start
```
#### 3. 创建 Docker Image

如果使用的是私有仓库，需要登录 GitHub 账号，这里通过 `--build-arg` 传递账号密码以保证在创建的镜像中能正常拉取代码。使用 **码云** 等其他的私有 git 仓库也一样，只不过需要稍微调整一下 `Dockerfile` 中的远端仓库地址。
```bash
docker build \
-t webhooks-nuxt-demo \
--build-arg username=your-username \
--build-arg password=your-password \
.
```

#### 4. 启动容器
在后台启动容器，并把容器内的 3000 端口 发布到主机的 80 端口。
```bash
sudo docker run -d -p 80:3000 webhooks-nuxt-demo
```
#### 5. 进入执行中的容器

```bash
# 列出所有容器
docker container ls -a
# 进入指定的容器中
docker exec -i -t 容器名称或者容器ID bash
```
