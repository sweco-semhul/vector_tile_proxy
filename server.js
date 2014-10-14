var assert = require('assert');
var Bridge = require('tilelive-bridge');
var path = require('path');
var fs = require('fs');
var mapnik = require('mapnik');
var zlib = require('zlib');
var UPDATE = process.env.UPDATE;

var source;
var bridge;
var loadedBridge;
var vectorserver_path = 'vectorproxy';


var setBridge = function(id, xml, callback) {
  if(loadedBridge !== id) {
    bridge = new Bridge({ xml:xml, blank:true }, function(err, s) {
      source = s;
      callback(bridge, source);
    });
    loadedBridge = id;
  } else {
    callback(bridge, source);
  }
}


var getTile = function(bridge, x,y,z, format, res) {
  bridge.getTile(z,x,y, function(err, buffer, headers) {
      if(buffer) {
        console.log('loaded tile:', z+'/'+y+'/'+x, cluster.worker.id);
        zlib.gunzip(buffer, function(err, buffer) {
          if(format === 'json') {
            var vtile = new mapnik.VectorTile(+z,+x,+y);
            vtile.setData(buffer);
            vtile.parse();
            res.send(vtile);
          } else {
            res.send(buffer);
          }
        });
      } else {
        console.error(err);
        res.send(err.toString());
      }
  });
}

var getInfo = function(source, layer, res) {
  source.getInfo(function(err, info) { 
    if(err) {
      console.error(err);
      res.send(err.toString());
      return;
    }
    info.format = 'pbf';
    info.scheme = 'xyz';
    info.tilejson = '2.0.0';
    info.glyphs = "mapbox://fontstack/{fontstack}/{range}.pbf",
    info.tiles = [
      '/'+vectorserver_path+'/data/' + layer + '/{x}/{y}/{z}/pbf'
    ];
    info.vector_layers = [ 
      {
        id: layer
      }
    ];

    res.send(info);
  });
}



// Include the cluster module
var cluster = require('cluster');

// Code to run if we're in the master process
if (cluster.isMaster) {

    // Count the machine's CPUs
    var cpuCount = require('os').cpus().length;

    // Create a worker for each CPU
    for (var i = 0; i < cpuCount; i += 1) {
        cluster.fork();
    }

    console.log(cpuCount + ' workers running at :3000');
    console.log('/map', '= map client');
    console.log('/' + vectorserver_path, '= vector proxy server');

// Code to run if we're in a worker process
} else {
  // Configure app
  var express = require('express');
  var app = express();

  app.configure(function(){
    app.use('/map', express.static(__dirname + '/map'));
    app.use('/fontstack', express.static(__dirname + '/fontstack'));
  });

  app.get('/'+vectorserver_path+'/:request/:layer?/:x?/:y?/:z?/:format?', function(req, res){

    var sql_lite = '<?xml version="1.0" encoding="utf-8"?>' +
          '<Map srs="+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0.0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs +over" background-color="steelblue">' +
            '<Layer name="' + req.params.layer + '" srs="+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0.0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs +over">' +
              '<Datasource>' +
                '<Parameter name="type">sqlite</Parameter>' +
                '<Parameter name="file">../../data/' + req.params.layer + '.sqlite</Parameter>' +
                '<Parameter name="table">' + req.params.layer + '</Parameter>' +
                '<Parameter name="geometry_field">geometry</Parameter>' +
              '</Datasource>' +
            '</Layer>' +
          '</Map>';

    var xml = sql_lite;

    setBridge(req.params.layer, xml, function(bridge, source) {
      if(req.params.request === 'info') {
        getInfo(source, req.params.layer, res);
      } else {
        getTile(bridge, req.params.x,req.params.y,req.params.z,req.params.format,res);
      }
    });
  });


  app.listen(3000);
  
}
