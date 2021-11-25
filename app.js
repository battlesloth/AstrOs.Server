const dotenv = require('dotenv');
dotenv.config();

const DataAccess = require('./api/dal/data_access');

var db = new DataAccess();
db.setup();

require('./api/config/passport');

const { Worker } = require('worker_threads');
const superagent = require('superagent');
const cookieParser = require('cookie-parser');
const createError = require('http-errors');
const express = require('express');
const logger = require('morgan');
const passport = require('passport');
const path = require('path');

const routesApi = require('./api/routes/index');
const { spawn } = require('child_process');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use(passport.initialize());
app.use('/api', routesApi);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

// websocket
const WebSocket = require('ws');
const {v4: uuidv4} = require('uuid');

const ws = new WebSocket.Server({ port: 5000 });

const clients = new Map();

// only one client at a time
ws.on('connection', (conn) => {
  const id = uuidv4();
  const metadata = { id };

  clients.set(conn, metadata);
});


function sendToClients(msg){
  const str = JSON.stringify(msg);
  [...clients.keys()].forEach((client) =>{
    try {
      client.send(str);
    } catch (err) {
      console.log(`websocket send error: ${err}`);
    }
  });
}

//monitor task

const coreMonitor = new Worker('./background_tasks/esp_monitor.js', { monitor: 'core' });

coreMonitor.on('message', msg => {
  console.log(`${msg.module}:${msg.status}`);
  sendToClients({module: 'core', status: msg.status});
});

coreMonitor.on('exit', exit => { console.log(exit); });
coreMonitor.on('error', err => { console.log(err); });

setInterval(() => { coreMonitor.postMessage({ monitor: '192.168.50.22' }) }, 5000);

module.exports = app;
