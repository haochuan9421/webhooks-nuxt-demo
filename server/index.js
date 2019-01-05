const express = require('express');
const consola = require('consola');
const bodyParser = require('body-parser'); // 用于添加请求体到 request 参数中, req.body
const crypto = require('crypto'); // 用于计算签名
const { exec } = require('child_process'); // 用于执行子进程
const { Nuxt, Builder } = require('nuxt');

const app = express();
const port = process.env.PORT || 3000;
var server = null; // 应用的 http server 实例
var render = null; // nuxt render 中间件
var upgrading = false; // 一个标记应用是否正在升级的 flag

app.set('port', port);

// 解析 application/json
app.use(bodyParser.json());

// 系统升级提示页的背景图片
app.get('/upgrading_bg.jpg', function(req, res) {
  res.sendFile('./upgrading_bg.jpg', { root: __dirname });
});

// 拦截所以 get 请求，如果系统正在升级中，则返回提示页面
app.get('*', function(req, res, next) {
  if (upgrading) {
    res.sendFile('./upgrading.html', { root: __dirname });
  } else {
    next();
  }
});

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

/**
 * 从 git 服务器拉取最新代码，更新 npm 依赖，并重新构建项目
 */
function upgrade() {
  execCommand('git pull -f && npm install', true);
}

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

// 初次构建
build();
