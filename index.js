var express = require("express")
  , path = require('path');

var app = express();
var http = require('http');
var server = http.createServer(app);

var io = require('socket.io').listen(server);
io.set('transports', ['xhr-polling']);
io.set('polling duration', 10);

app.use(express.logger());

app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.favicon('public/images/favicon.ico')); 

var mongojs = require('mongojs');
console.log("environment", process.env.NODE_ENV);
var db = mongojs(process.env.NODE_ENV == 'production' ? process.env.MONGOLAB_URI : 'localhost');
var Benches = db.collection('benches');
var BenchLogs = db.collection('benchLogs');
var Devices = db.collection('devices');
var DeviceLogs = db.collection('deviceLogs');

var auth = express.basicAuth('assembly', 'worthington');
// app.all('*', auth);

app.get('/', auth, function(req, res) {
  // var benches = [{
  //   name: 'Pancakes',
  //   heartbeat: new Date().getTime(),
  //   build: 'abc123',
  //   deviceBuild: 'abc123',
  //   ip: '0.0.0.0',
  //   gateway: '0.0.0.0',
  //   ssh: '0.0.0.0',
  //   port: '2222'
  // }, {
  //   name: 'Waffles',
  //   heartbeat: new Date().getTime(),
  //   build: 'abc123',
  //   deviceBuild: 'abc123',
  //   ip: '0.0.0.0',
  //   gateway: '0.0.0.0',
  //   ssh: '0.0.0.0',
  //   port: '2222'
  // }];
  var benches = [];
  Benches.find(function (err, benches){
    console.log('names', benches);
    var count = 0;
    // get number made by each bench
    benches.forEach(function(bench, i){
      Devices.find({'bench':bench.name, 'tiFirmware': 'pass'
        , 'adc': 'passed', 'dac': 'passed', 'sck': 'passed'
        , 'i2c': 'passed', 'pin': 'passed', 'extPower': 'passed'
        , 'wifi': 'pass'}, function(err, devices){
        benches[i].count = devices.length;
        count++;

        if (count >= benches.length){
          res.render('index', {title: 'Testalator | Technical Machine', 
              benches: benches});
        }
      });
    });
    
  });
  
});

app.get('/d/:device', auth, function(req, res){
  var device = req.params.device;

  Devices.findOne({'id': device}, function (err, deviceInfo){
    // var deviceInfo = {
    //   built: new Date().getTime(),
    //   deviceId: 'abc123',
    //   tiFirmware: 'v1.2',
    //   firmware: 'abc213',
    //   adc: 'pass',
    //   spi: 'pass',
    //   i2c: 'pass',
    //   gpio: 'fail',
    //   otp: 'fail',
    //   wifi: 'fail',
    //   codeUpload: 'fail',
    // };
    res.render('device', {title: device+' | Testalator', id: device, device: deviceInfo, logs: ""});
  });

  
});

// curl -H 'Content-Type: application/json' -d '{"heartbeat":"1234", "name":"Pancakes", "build": "dfghig", "deviceBuild": "df93wd", "ip": "1.1.1.1", "gateway": "1.1.1.1"}' localhost:5000/bench

app.get('/b/:bench', auth, function(req, res){
  var bench = req.params.bench;
  console.log("got ", bench);
  // var devices = [{
  //   built: new Date().getTime(),
  //   id: 'abc123',
  //   tiFirmware: 'v1.2',
  //   firmware: 'abc213',
  //   adc: 'pass',
  //   spi: 'pass',
  //   i2c: 'pass',
  //   gpio: 'fail',
  //   otp: 'fail',
  //   wifi: 'fail',
  //   codeUpload: 'fail',
  // }, {
  //   built: new Date().getTime(),
  //   id: 'abc123',
  //   tiFirmware: 'v1.2',
  //   firmware: 'abc213',
  //   adc: 'pass',
  //   spi: 'pass',
  //   i2c: 'pass',
  //   gpio: 'fail',
  //   otp: 'fail',
  //   wifi: 'fail',
  //   codeUpload: 'fail',
  // }];

  // find all devices by test bench and sort by date
  // filter by unique id
  Devices.find({'bench': bench})
    .sort({'built': -1}, function (err, docs){
      var passed = docs.filter(function(doc){
        return (doc.tiFirmware == 'pass' && doc.adc == 'passed' && doc.dac == 'passed'
          && doc.sck == 'passed' && doc.i2c == 'passed' && doc.pin == 'passed'
          && doc.extPower == 'passed' && doc.wifi == 'pass');
      })

      res.render('bench', {title: bench+' | Testalator', bench: bench, devices: docs, success: passed.length})
    });
});

// curl -H 'Content-Type: application/json' -d '{"built":"1234", "id":"testest", "tiFirmware": "v1.2", "firmware": "df93wd", "adc": "pass", "spi": "pass", "i2c": "pass", "gpio": "fail", "ram": "fail", "wifi": "pass", "codeUpload": "pass", "bench": "Pancakes"}' localhost:5000/device

app.post('/device', function(req, res){
  var device = req.body;
  console.log("adding new device", device);
  device.logs = [];

  // Devices.save(device, function(err){
  //   if (err){
  //     console.log("could not save new device", err);
  //     return res.send(false);
  //   }
  //   io.sockets.emit('new_device', device);
  //   console.log('new device added');
  //   res.send(true);
  // });

  Devices.findAndModify({
    query: {id: device.id, bench: device.bench}
    , update: {
      $set: device
    }
    , upsert: true
  }, function(err, doc){
    if (err){
      console.log("could not save new device", err);
      return res.send(false);
    }
    io.sockets.emit('new_device', device);
    console.log('new device added');
    res.send(true);
  });
});

// app.get('/test_bench', function(req, res) {
//   io.sockets.emit('bench_heartbeat', {
//     name: 'fried_eggs',
//     heartbeat: new Date().getTime(),
//     build: 'abc123',
//     deviceBuild: 'abc123',
//     md5: 'md5sum',
//     ip: '0.0.0.0',
//     gateway: '0.0.0.0',
//     ssh: '0.0.0.0',
//     port: '2222'
//   });
//   res.send(true);
// });

app.post('/bench', function(req, res) {
  // console.log("request header", req.headers);
  var benchHeartbeat = req.body;
  // insert into database
  console.log("heartbeat", benchHeartbeat);
  benchHeartbeat.heartbeat = new Date().getTime();
  Benches.findAndModify({
    query: {name: benchHeartbeat.name}
    , update: {
      $set: benchHeartbeat
    }
    , upsert: true
  }, function(err, doc){
    if (!err) {
      console.log('saved', benchHeartbeat);      
      // emit heartbeat
      io.sockets.emit('bench_heartbeat', benchHeartbeat);
      res.send(true);
    } else { 
      console.log("not saved", err, benchHeartbeat);
      res.send(false);
    }
  });
});

// curl -H 'Content-Type: application/json' -d '{"built":"1234", "id":"abc123", "tiFirmware": "v1.2", "firmware": "df93wd", "adc": "pass", "spi": "pass", "i2c": "pass", "gpio": "fail", "ram": "fail", "wifi": "pass", "codeUpload": "pass", "bench": "Pancakes"}' localhost:5000/device
app.post('/d/:device/test', function(req, res) {
  // console.log("request header", req.headers);
  var device = req.body;
  var updateTest = {};
  updateTest[req.body.test] = req.body.status;
  // insert into database
  console.log("device", req.body.device);
  Devices.findAndModify({
    query: {id: req.body.device, firmware: req.body.firmware, otp:req.body.otp, bench:req.body.bench},
    update: {
      $set: updateTest
    },
    upsert:true
  }, function(err, doc) {
    if (!err) {
      console.log('saved', doc);      
      // emit heartbeat
      io.sockets.emit('device_update_'+req.body.device, {"test": req.body.test, "status": req.body.status});
      io.sockets.emit('device_update', {"device":req.body.device, "test": req.body.test, "status": req.body.status});
      res.send(true);
    } else { 
      console.log("not saved", err, doc);
      res.send(false);
    }
  });
  
});

// drop all but the earliest from each bench
// app.get('/remove', function(){
//   // Devices.find()
//   var keys = ["adc", "dac", "extPower", "firmware",
//       "gpio", "i2c", "otp", "pin", "sck", "spi",
//       "tiFirmware", "wifi"];
//   Devices.aggregate({$group: {
//     _id: {id: "$id", bench: "$bench"},
//     count: {$sum: 1},
//     docs: {$push: {_id: "$_id", built: "$built", id: "$id",
//       adc: "$adc", dac: "$dac", extPower: "$extPower", firmware: "$firmware",
//       gpio: "$gpio", i2c: "$i2c", otp: "$otp", pin: "$pin", sck: "$sck", spi: "$spi",
//       tiFirmware: "$tiFirmware", wifi: "$wifi", bench: "$bench"}}
//   }}, { $match: {
//     count: {$gt : 1}
//   }}, function(err, docs){
//     var count = 0;

//     // console.log(err, docs);
//     docs.forEach(function(doc){
//       // console.log(doc.docs);
//       var sorted = doc.docs.sort(function(a, b){
//         if (!a.built){
//           return 1;
//         }
//         if (!b.built){
//           return -1;
//         }
//         a = new Date(a.built);
//         b = new Date(b.built);
//         return a>b ? -1 : a<b ? 1 : 0;
//       })


//       var keep = doc.docs[0];

//       // aggregate all pass/fails
//       for(var i =0; i < doc.docs.length; i++){
//         for (var a = 0; a < keys.length; a++){
//           console.log(keys[a], doc.docs[i][keys[a]]);

//           if (doc.docs[i][keys[a]] == "passed" || doc.docs[i][keys[a]] == "pass" ){
//             keep[keys[a]] = doc.docs[i][keys[a]];
//           }
//         }
//       }
//       delete keep._id;
//       // console.log("keep", keep);

//       // remove everything
//       // console.log("remove", doc._id.id, doc._id.bench);
//       Devices.remove({id: doc._id.id, bench: doc._id.bench}, function(err){
//         // reinsert keep
//         Devices.save(keep, function(err, doc){
//           console.log("saved", keep, count, docs.length);

//           count++;
//           if (count >= docs.length){
//             return true;
//           }
//         })
//       });
//     });
//   });
// });

app.get('/b/:bench/logs', auth, function (req, res){
  // find the logs for this bench
  console.log("finding bench logs");
  var bench = req.params.bench;
  BenchLogs.findOne({'device': bench}, function (err, logs) {
    // console.log("logs", err, logs);
    res.render('logs', {title: bench+' | logs', logs: logs, id: bench, type:"Bench"});
  });
});

// curl -X POST -H "Content-Type: application/json" -d '{"bench":"fried_eggs","data":"herp derp some data"}' http://localhost:5000/b/fried_eggs/logs

app.post('/b/:bench/logs', function(req, res) {
  var log = req.body;
  var bench = req.params.bench.toLowerCase();
  // console.log("req.body", req.body.device);
  // console.log("bench", bench, req.body.device.toLowerCase());
  if (bench != req.body.device.toLowerCase()){
    console.error("params does not match request", bench, req.body.device);
    return res.send(false);
  }
  // look for a log by this device id
  BenchLogs.findAndModify({
    query: {device: req.body.device},
    update: {
      $push: {log: req.body.data}
    },
    upsert:true
  }, function(err, doc, lastErrorObject) {
    // emit an event about this log update

    if (!err) {
      console.log('saved', req.body.device);
      io.sockets.emit('log_update_'+bench, req.body.data);
      res.send(true);
    } else { 
      console.log("not saved", req.body.device, err);      
      res.send(false);
    }
  });
});

app.get('/d/:device/logs', auth, function (req, res){
  var device = req.params.device;
  // find that device as well
  Devices.find({"id": device}, function(err, docs){
    DeviceLogs.findOne({'device': device}, function (err, logs) {
      res.render('logs', {title: device+' | logs', logs: logs, id: device, type:"Device", devices: docs});
    });
  });
});

// curl -X POST -H "Content-Type: application/json" -d '{"device":"device1","data":"herp derp some data"}' http://localhost:5000/d/device1/logs

app.post('/d/:device/logs', function(req, res) {
  var log = req.body;
  var device = req.params.device.toLowerCase();
  // console.log("req.body", req.body.device);
  // console.log("bench", bench, req.body.device.toLowerCase());
  if (device != req.body.device.toLowerCase()){
    console.error("params does not match request", device, req.body.device);
    return res.send(false);
  }
  // look for a log by this device id
  DeviceLogs.findAndModify({
    query: {device: req.body.device},
    update: {
      $push: {log: req.body.data}
    },
    upsert:true
  }, function(err, doc, lastErrorObject) {
    // emit an event about this log update

    if (!err) {
      console.log('saved', req.body.device);
      io.sockets.emit('log_update_'+device, req.body.data);
      res.send(true);
    } else { 
      console.log("not saved", req.body.device, err);      
      res.send(false);
    }
  });
});

server.listen(app.get('port'), function() {
  console.log("Listening on " + app.get('port'));
});