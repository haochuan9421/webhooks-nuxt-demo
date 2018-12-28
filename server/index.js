const express = require('express');
const consola = require('consola');
const { Nuxt, Builder } = require('nuxt');
const { spawn } = require('child_process');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const port = process.env.PORT || 3000;

var appServer, // The app server
  tmpServer, // The temporary server which will be used when the app is upgrading
  upgrading; // Does the app is upgrading now

build();

/**
 * Build the app with config
 */
async function build() {
  const app = express();

  // Parse application/x-www-form-urlencoded
  app.use(bodyParser.urlencoded({ extended: false }));
  // Parse application/json
  app.use(bodyParser.json());

  app.set('port', port);

  // Import and Set Nuxt.js options
  let config = require('../nuxt.config.js');
  config.dev = !(process.env.NODE_ENV === 'production');

  // Subscribe to the Webhooks's post request from GitHub.com in production mode
  config.dev ||
    app.post('/webhooks', function(req, res) {
      // Use secret token to securing this API, Doc: https://developer.github.com/webhooks/securing/
      const SECRET_TOKEN = 'b65c19b95906e027c5d8';
      // Compute the hash
      const hash = `sha1=${crypto
        .createHmac('sha1', SECRET_TOKEN)
        .update(JSON.stringify(req.body))
        .digest('hex')}`;
      // Validating payloads from GitHub
      const isValid = hash === req.headers['x-hub-signature'];
      // If the request is validated，send back successful status and restart the server.
      if (isValid) {
        res.status(200).end();
        restart();
      } else {
        // Send the forbidden message
        res.status(403).send('Permission Denied');
      }
    });
  // Expose a restart api for manually restart
  config.dev ||
    app.all('/restart', function(req, res) {
      res
        .status(200)
        .send('pulling the latest code & restart the server, please wait...');
      restart();
    });
  // Init Nuxt.js
  const nuxt = new Nuxt(config);

  // Deleted "npm run build" script and build anyway，thanks to the "NODE_ENV" variable，the build behavior will still be different.
  const builder = new Builder(nuxt);
  await builder.build();

  // Give nuxt middleware to express
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
 * Create the app server and set "upgrading" to false then
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
 * Create the temporary server and rebuild the app then
 */
function createTmpServer() {
  const app = express();
  app.get('*', function(req, res) {
    res.sendFile('./upgrading.html', { root: __dirname });
  });
  tmpServer = app.listen(port, function(error) {
    if (error) {
      return;
    }
    consola.ready({
      message: `tmpServer listening on http://localhost:${port}`,
      badge: true
    });
    build();
  });
}

/**
 * Close the app server and start a temporary server for upgrade.
 */
function restart() {
  if (upgrading) {
    return;
  }
  upgrading = true;
  // Create a child process to pulling the latest code from GitHub
  const subprocess = spawn('git', ['pull', '-f'], { stdio: [0, 1, 2] });
  subprocess.on('close', () => {
    // After pulling the latest code, close the app server and start a temporary server
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
