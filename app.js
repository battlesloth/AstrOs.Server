const dotenv = require('dotenv');
dotenv.config();

require('./api/models/db');
require('./api/config/passport');

const { Worker } = require('worker_threads');
const superagent  = require('superagent');
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
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

// websocket
const httpServer = require("http").createServer(app);

httpServer.listen(5000, () =>{
  console.log("Websocket started on port 5000");
});   

httpServer.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log('Address in use, retrying...');
    setTimeout(() => {
      server.close();
      server.listen(PORT, HOST);
    }, 1000);
  } else {
    console.log(`Websocket error : ${e.code}`);
  }
});

const websocket = require("socket.io");

const io = websocket(httpServer);

io.on('connection', socket =>{
  console.log(`Socket connected: ${socket}`);
})

//monitor task

const headMoitor = new Worker('./background_tasks/esp_monitor.js', {monitor: 'head unit'});

headMoitor.on('message', msg => {
  console.log(`${msg.module}:${msg.status}`);
  io.emit(JSON.stringify(msg));
});

headMoitor.on('exit', exit =>{console.log(exit);});
headMoitor.on('error', err =>{console.log(err);});

setInterval(() =>{headMoitor.postMessage({monitor: '192.168.50.22'})}, 5000);

module.exports = app;
