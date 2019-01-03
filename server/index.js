const express = require('express');
const consola = require('consola');
const { Nuxt, Builder } = require('nuxt');
const { spawn } = require('child_process');
const bodyParser = require('body-parser'); // 用于添加请求体到 request 参数中, req.body
const crypto = require('crypto');
const port = process.env.PORT || 3000;

var appServer, // 应用主服务
  tmpServer, // 当应用更新时启动的临时服务，用于提示访问者系统正在升级中
  upgrading; // 应用是否正在升级

build();

/**
 * 根据配置，构建项目
 */
async function build() {
  const app = express();

  // 解析 application/json
  app.use(bodyParser.json());

  app.set('port', port);

  // 导入并设置 Nuxt.js 参数
  let config = require('../nuxt.config.js');
  config.dev = !(process.env.NODE_ENV === 'production');

  // 在生成环境中订阅来自 GitHub 的 Webhooks 请求（post 类型）
  config.dev ||
    app.post('/webhooks', function(req, res) {
      // 使用 secret token 对该 API 的调用进行鉴权, 详细文档: https://developer.github.com/webhooks/securing/
      const SECRET_TOKEN = 'b65c19b95906e027c5d8';
      // 计算签名
      const hash = `sha1=${crypto
        .createHmac('sha1', SECRET_TOKEN)
        .update(JSON.stringify(req.body))
        .digest('hex')}`;
      // 验证签名和 Webhooks 请求的请求头中的是否一致
      const isValid = hash === req.headers['x-hub-signature'];
      // 如果验证通过，返回成功状态并重启服务
      if (isValid) {
        res.status(200).end();
        restart();
      } else {
        // 鉴权失败，返回无权限提示
        res.status(403).send('Permission Denied');
      }
    });
  // 初始化 Nuxt.js
  const nuxt = new Nuxt(config);

  // 构建应用，得益于环境变量 NODE_ENV，在开发环境和生产环境下这个构建的表现会不同
  const builder = new Builder(nuxt);
  await builder.build();

  // 添加 nuxt 中间件到 express
  app.use(nuxt.render);

  if (appServer) {
    tmpServer &&
      tmpServer.listening &&
      tmpServer.close(error => {
        if (error) {
          return;
        }
        createAppServer(app, port);
      });
  } else {
    createAppServer(app, port);
  }
}

/**
 * 创建应用服务，并将 upgrading 变量设置为 false
 */
function createAppServer(app, port) {
  appServer = app.listen(port, function(error) {
    if (error) {
      return;
    }
    consola.ready({
      message: `Server listening on http://localhost:${port}`,
      badge: true
    });
    upgrading = false;
  });
}

/**
 * 创建临时服务，用于提示访问者系统正在升级中，并重新构建应用
 */
function createTmpServer() {
  const app = express();
  app.get('/bg.jpg', function(req, res) {
    res.sendFile('./bg.jpg', { root: __dirname });
  });
  app.get('*', function(req, res) {
    res.sendFile('./upgrading.html', { root: __dirname });
  });

  tmpServer = app.listen(port, function(error) {
    if (error) {
      return;
    }
    console.log(`tmpServer listening on http://localhost:${port}`);
    build();
  });
}

/**
 * 关闭应用服务，并启动一个临时的提示服务
 */
function restart() {
  if (upgrading) {
    return;
  }
  upgrading = true;
  // 创建一个子进程，从 GitHub 拉取最新的代码
  const subprocess = spawn('git', ['pull', '-f'], { stdio: [0, 1, 2] });
  subprocess.on('close', () => {
    // 拉取完成后，关闭应用服务，并创建一个临时服务
    appServer &&
      appServer.listening &&
      appServer.close(error => {
        if (error) {
          return;
        }
        createTmpServer();
      });
  });
}
