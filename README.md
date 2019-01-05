# webhooks-nuxt-demo

> 借助 Webhooks 实现 Vue SSR 项目的自动化部署

## 一、使用 [create-nuxt-app](https://zh.nuxtjs.org/guide/installation) 脚手架创建项目

创建时的各种选项如下图所示，你可以根据自己项目的实际情况进行选择，但 `server framework` 请选择 `express`，本文也将以 `express` 作为服务端框架展开介绍。

<img style="width: 500px" src="https://github.com/HaoChuan9421/webhooks-nuxt-demo/blob/master/assets/preset.png"/>

## 二、修改 package.json 中的 npm scripts

`Nuxt` 脚手架生成的项目，默认在生产环境下需要先执行 `npm run build` 构建代码，然后再执行 `npm start` 启动服务，这略显繁琐，也不利于自动部署、重新构建等工作的展开，这里将两者的功能合二为一，执行 `npm start`，即可在[编码中使用构建](https://zh.nuxtjs.org/api/nuxt)并启动服务。得益于 `Nuxt` 配置中的 [dev 参数](https://zh.nuxtjs.org/api/configuration-dev), 在不同的环境下（`NODE_ENV`），即使使用的都是 `new Builder(nuxt).build()` 来进行构建，但由于 `dev` 参数的不同，`Nuxt` 的构建行为也会相应的不同并进行针对性的优化。这里生产环境（`production`）下启动服务也不再是通过 `node` 命令而是使用 [nodemon](https://www.npmjs.com/package/nodemon)，它用于监听 `server/index.js` 文件的变化，在 `server/index.js` 更新时可以自动重启服务。调整前后的 `npm scripts` 如下：
```js
// 前
"scripts": {
  "dev": "cross-env NODE_ENV=development nodemon server/index.js --watch server",
  "build": "nuxt build",
  "start": "cross-env NODE_ENV=production node server/index.js"
}
```
```
// 后
"scripts": {
  "dev": "cross-env NODE_ENV=development nodemon server/index.js --watch server",
  "start": "cross-env NODE_ENV=production nodemon server/index.js --watch server"
}
```
同时，删除 `server/index.js` 中原本的条件判断：
```js
//if (config.dev) {
  const builder = new Builder(nuxt);
  await builder.build();
//}
```
调整之后，执行 `npm run dev`，就会在 3000 端口启动一个有代码热替换（`HMR`）等功能的一个开发（`development`）服务，而执行 `npm start` 就会构建出压缩后的代码，并启动一个带 `gzip` 压缩等功能的生产（`production`）服务。

## 三、添加 Webhooks 接口

`Webhooks` 是什么？简单来说：假如你向一个仓库添加了 `Webhook` ，那么当你 `push` 代码时，`git` 服务器就会自动向你指定的地址，发送一个带有更新信息（`payload`）的 `post` 请求。了解更多，请阅读 [GitHub 关于 Webhooks 的介绍文档](https://developer.github.com/webhooks/) 或者 [码云的文档](https://gitee.com/help/categories/40)。由于我们使用了 `express` 来创建 `http` 服务，所以我们可以像这样方便的添加一个接口，用于接收来自 `git` 服务器的 `post` 请求：
```js
...
// 订阅来自 git 服务器 的 Webhooks 请求（post 类型）
app.post('/webhooks', function(req, res) {
  // 使用 secret token 对该 API 的调用进行鉴权, 详细文档: https://developer.github.com/webhooks/securing/
  const SECRET_TOKEN = 'b65c19b95906e027c5d8';
  // 计算签名
  const signature = `sha1=${crypto
    .createHmac('sha1', SECRET_TOKEN)
    .update(JSON.stringify(req.body))
    .digest('hex')}`;
  // 验证签名和 Webhooks 请求中的签名是否一致
  const isValid = signature === req.headers['x-hub-signature'];
  // 如果验证通过，返回成功状态并更新服务
  if (isValid) {
    res.status(200).end('Authorized');
    upgrade();
  } else {
    // 鉴权失败，返回无权限提示
    res.status(403).send('Permission Denied');
  }
});
...
```
这里的 `app` 是一个 `express` 应用，我们通过了 `Node` 的 `crypto` 模块计算签名并和 `Webhooks` 请求中的签名比对来进行鉴权，以保证接口调用的安全性（这里的能够获取到 `Webhooks` 请求的请求体 —— `req.body` 是由于使用了 [body-parser 中间件](https://www.npmjs.com/package/body-parser)）。如果鉴权通过则返回成功状态，并执行 `upgrade` 函数来更新服务，如果鉴权失败，则返回无权限提示。同时，你需要向仓库添加 `Webhook`，如下图：

<img style="width: 100%" src="https://github.com/HaoChuan9421/webhooks-nuxt-demo/blob/master/assets/add_webhooks.png"/>


## 四、如何无缝更新服务
如果你的项目已经在 `http://www.example.com/` 下启动成功，那么当你每次向 `GitHub` 仓库 `push` 代码时，你的接口都会收到一个来自 `GitHub` 的 `post` 请求，并在鉴权通过后执行 `upgrade` 函数来更新服务。关于如何在服务器上启动项目我们按下不表，先介绍 `upgrade` 函数都做了什么。
```js
/**
 * 从 git 服务器拉取最新代码，更新 npm 依赖，并重新构建项目
 */
function upgrade() {
  execCommand('git pull -f && npm install', true);
}
```
`execCommand` 函数如下，这里我们使用了 `Node` 的 [child_process](https://nodejs.org/api/child_process.html#child_process_child_process_exec_command_options_callback) 模块，用以创建子进程，来执行拉取代码， 更新 `npm` 依赖等命令：
```js
const { exec } = require('child_process');
/**
 * 创建子进程，执行命令
 * @param {String} command 需要执行的命令
 * @param {Boolean} reBuild 是否重新构建应用
 * @param {Function} callback 执行命令后的回调
 */
async function execCommand(command, reBuild, callback) {
  command && (await exec(command, callback));
  // 根据配置文件，重新构建项目
  reBuild && build();
}
```
`build` 函数，会根据配置文件，重新构建项目，这里的 `upgrading` 是一个标记应用是否正在升级的 `flag`。
```js
/**
 * 根据配置，构建项目
 */
async function build() {
  if (upgrading) {
    return;
  }
  upgrading = true;
  // 导入 Nuxt.js 参数
  let config = require('../nuxt.config.js');
  // 根据环境变量 NODE_ENV，设置 config.dev 的值
  config.dev = !(process.env.NODE_ENV === 'production');
  // 初始化 Nuxt.js
  const nuxt = new Nuxt(config);
  // 构建应用，得益于环境变量 NODE_ENV，在开发环境和生产环境下这个构建的表现会不同
  const builder = new Builder(nuxt);
  // 等待构建
  await builder.build();
  // 构建完成后，更新 render 中间件
  render = nuxt.render;
  // 将 flag 置反
  upgrading = false;
  // 如果是初次构建，则创建 http server
  server || createServer();
}
```
`createServer` 函数如下，这里有两个全局变量，`render` 和 `server`，其中 `render` 变量保存了最新构建后的 `nuxt.render` 中间件，而 `server` 变量是应用的 `http server` 实例。
```js
/**
 * 创建应用的 http server
 */
function createServer() {
  // 向 express 应用添加 nuxt 中间件，重新构建之后，中间件会发生变化
  // 这种处理方式的好处就在于 express 使用的总是最新的 nuxt.render
  app.use(function() {
    render.apply(this, arguments);
  });
  // 启动服务
  server = app.listen(port, function(error) {
    if (error) {
      return;
    }
    consola.ready({
      message: `Server listening on http://localhost:${port}`,
      badge: true
    });
  });
}
```
访问[这里](https://github.com/HaoChuan9421/webhooks-nuxt-demo/blob/master/server/index.js)，查看完整的 `server/index.js` 文件。但这里存在一个问题☝️，就是每次执行 `build` 函数，重新构建时，由于 `Nuxt` 会删除上一次构建生成的文件（清空`.nuxt/dist/client` 和 `.nuxt/dist/server` 文件夹），而构建完成之后才会生成新的文件，那么如果用户恰好在这个空档期访问网站怎么办？一种解决方案是干预 `webpack` 的这种行为，不去清空这两个文件夹，不过我目前没有找到 `Nuxt` 中可以修改这个配置的地方（欢迎评论），另一种解决方案就是在项目重新构建的时候，给用户返回一个友好的提示页，告诉他系统正在升级中。这也是我设置 `upgrading` 变量来标记应用是否正在升级中的意义所在，下面这段代码将展示，如果实现这种效果：
```js
const express = require('express');
const app = express();
// 拦截所以 get 请求，如果系统正在升级中，则返回提示页面
app.get('*', function(req, res, next) {
  if (upgrading) {
    res.sendFile('./upgrading.html', { root: __dirname });
  } else {
    next();
  }
});
```
要说明的一点是：`app.get('*', ...)` 必须写在前面，你可以在[这里](https://expressjs.com/en/4x/api.html#app.use) 的 `Description` 中找到解释。如此一来，当用户恰好在应用重新构建时访问网站，就会出现一个友好的提示页，而当构建完成后，用户再次访问网站，就是一个升级后的应用，整个过程，服务器始终是保持在线的状态，`http server` 并没有停止或者重启。

至此，你已经可以把项目代码上传到 `GitHub` 或者 **码云**了（不同的服务商对 `Webhooks` 的鉴权方式可能会有所不同，你需要参考他们的文档对接口的鉴权方式进行一点调整）。

## 五、部署公钥管理

为私有项目添加部署公钥，使得项目在服务器上或者在 `Docker` 中可以安全的进行代码克隆和后续的拉取更新，[参考链接1](https://gitee.com/help/articles/4181#article-header0)、[参考链接2](https://help.github.com/articles/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent/#generating-a-new-ssh-key)。这里以 `GitHub` 为例进行介绍：

1. 生成一个 `GitHub` 用的 `SSH key`
    ```bash
    ssh-keygen -t rsa -C 'hc199421@gmail.com' -f ~/.ssh/github_id_rsa
    ```
    
    <img src="https://github.com/HaoChuan9421/webhooks-nuxt-demo/blob/master/assets/generate_key.png">

    一般情况下，是不需要使用 `-f ~/.ssh/github_id_rsa` 来指定生成 `SSH Key` 的文件名的，默认生成的是 `id_rsa`。但考虑到一台机器同时使用不同的 `git` 服务器的可能性，所以这里对生成的 `SSH key` 名称进行了自定义。这里的邮箱是你的 `git` 服务器 （`GitHub`）登录邮箱。

    <img src="https://github.com/HaoChuan9421/webhooks-nuxt-demo/blob/master/assets/ssh_key.png">
    
2. 在 `~/.ssh` 目录下新建一个 config 文件，添加如下内容，[参考文档](https://www.ssh.com/ssh/config/)。
    ```bash
    # github
    Host github.com
    HostName github.com
    StrictHostKeyChecking no
    PreferredAuthentications publickey
    IdentityFile ~/.ssh/github_id_rsa
    ```
    其中 `Host` 和 `HostName` 填写 `git` 服务器的域名，`IdentityFile` 指定私钥的路径，`StrictHostKeyChecking` 设置为 `no` 可以跳过下图中 `(yes/no)` 的询问，这一点对于 `Docker` 流畅的创建镜像很有必要（否则可能要写 `expect` 脚本），当然你也可以通过执行 `ssh-keyscan github.com > ~/.ssh/known_hosts` 将 `host keys` 提前添加到 `known_hosts` 文件中。

    <img src="https://github.com/HaoChuan9421/webhooks-nuxt-demo/blob/master/assets/known_hosts.png">

3. 在项目仓库添加部署公钥

    <img src="https://github.com/HaoChuan9421/webhooks-nuxt-demo/blob/master/assets/add_key.png">

4. 测试公钥是否可用

    ```bash
    ssh -T git@github.com
    ```
    如果出现下图所示内容则表明大功告成，可以执行下一步了。👏👏👏🎉🎉🎉

    <img src="https://github.com/HaoChuan9421/webhooks-nuxt-demo/blob/master/assets/check_key.png">
    
至此，如果你不需要使用 `Docker` 部署，而是使用传统的部署方式，那么你只需要在服务器上安装 `Node` 和 `git`，并把仓库代码克隆到服务器上，然后执行 `npm start` 在 80 端口启动服务就可以了。你可以使用 `nohup` 命令或者 [forever](https://www.npmjs.com/package/forever) 等使服务常驻后台。

## 六、Docker 部署

#### 1. [安装 Docker CE](https://docs.docker.com/install/linux/docker-ce/ubuntu/) (阿里云 Ubuntu 18.04 已亲试)

#### 2. 创建 Dockerfile
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
#### 3. 创建 Docker Image

通过 `cat` 命令读取之前创建的 `SSH` 公钥和私钥的内容并作为变量传递给 `Docker`。由于 `build` 镜像的过程需要执行 `git clone` 和 `npm install`，取决于机器性能和带宽，可能需要花费一定的时间。一个正常的 `build` 过程如下图：

```bash
docker build \
-t webhooks-nuxt-demo \
--build-arg ssh_prv_key="$(cat ~/.ssh/github_id_rsa)" \
--build-arg ssh_pub_key="$(cat ~/.ssh/github_id_rsa.pub)" \
.
```

<img style="width: 200px" src="https://github.com/HaoChuan9421/webhooks-nuxt-demo/blob/master/assets/build-image.png"> 

#### 4. 启动容器
在后台启动容器，并把容器内的 3000 端口 发布到主机的 80 端口。
```bash
sudo docker run -d -p 80:3000 webhooks-nuxt-demo
```
#### 5. 进入执行中的容器
必要的时候可以进入容器中执行一些操作：
```bash
# 列出所有容器
docker container ls -a
# 进入指定的容器中
docker exec -i -t 容器名称或者容器ID bash
```

## 七、留个后门

有时候我们可能需要执行一些命令，来对项目进行更佳灵活的操作，比如切换项目的分支、进行版本回滚等。但如果只是为了执行一行命令就需要连接服务器，再进入容器内，难免有些繁琐，启发于 `Webhooks`，我们不妨留个后门👻：
```js
// 预留一个接口，必要时可以通过调取这个接口，来执行命令。
// 如：通过发起下面这个 AJAX 请求，来进行 npm 包的升级并重新构建项目。
// var xhr = new XMLHttpRequest();
// xhr.open('post', '/command');
// xhr.setRequestHeader('access_token', 'b65c19b95906e027c5d8');
// xhr.setRequestHeader('Content-Type', 'application/json; charset=UTF-8');
// xhr.send(
//   JSON.stringify({
//     command: 'npm update',
//     reBuild: true
//   })
// );
app.post('/command', function(req, res) {
  // 如果必要的话可以进行更严格的鉴权，这里只是一个示范
  if (req.headers['access_token'] === 'b65c19b95906e027c5d8') {
    // 执行命令，并返回命令的执行结果
    execCommand(req.body.command, req.body.reBuild, function(
      error,
      stdout,
      stderr
    ) {
      if (error) {
        res.status(500).send(error);
      } else {
        res.status(200).json({ stdout, stderr });
      }
    });
    // 如果是纯粹的重新构建，没有需要执行的命令，直接结束请求，不需要等待命令的执行结果
    if (!req.body.command && req.body.reBuild) {
      res.status(200).end('Authorized and rebuilding!');
    }
  } else {
    res.status(403).send('Permission Denied');
  }
});
```
