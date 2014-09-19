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


var getTile = function(bridge, x,y,z,format,res) {
  bridge.getTile(z,x,y, function(err, buffer, headers) {
      
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
  });
}

var getInfo = function(source, layer, res) {
  source.getInfo(function(err, info) { 
    if(err) {
      console.log(err);
      return;
    }
    info.format = 'pbf';
    info.scheme = 'xyz';
    info.tilejson = '2.0.0';
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


// Configure app
var express = require('express');
var app = express();

app.configure(function(){
  app.use('/map', express.static(__dirname + '/map'));
});

app.get('/'+vectorserver_path+'/:request/:layer?/:x?/:y?/:z?/:format?', function(req, res){

  var shp_xml = '<?xml version="1.0" encoding="utf-8"?>' +
        '<Map srs="+proj=merc +lon_0=0 +lat_ts=0 +x_0=0 +y_0=0 +ellps=WGS84 +datum=WGS84 +units=m +no_defs" background-color="steelblue">' +
          '<Layer name="' + req.params.layer + '" srs="+proj=merc +lon_0=0 +lat_ts=0 +x_0=0 +y_0=0 +ellps=WGS84 +datum=WGS84 +units=m +no_defs">' +
              '<Datasource>' +
                  '<Parameter name="file">../../data/' + req.params.layer + '.shp</Parameter>' +
                  '<Parameter name="type">shape</Parameter>' +
              '</Datasource>' +
          '</Layer>' +
        '</Map>';

  // Config try for postgis
  var psql_xml = '<?xml version="1.0" encoding="utf-8"?>' +
        '<Map srs="+proj=merc +lon_0=0 +lat_ts=0 +x_0=0 +y_0=0 +ellps=WGS84 +datum=WGS84 +units=m +no_defs" background-color="steelblue">' +
          '<Layer name="' + req.params.layer + '" srs="+proj=merc +lon_0=0 +lat_ts=0 +x_0=0 +y_0=0 +ellps=WGS84 +datum=WGS84 +units=m +no_defs">' +
              '<Datasource>' +
                  '<Parameter name="type">postgis</Parameter>' +
                  '<Parameter name="host">localhost</Parameter>' +
                  '<Parameter name="dbname">mapnik_test</Parameter>' +
                  '<Parameter name="user">semhul</Parameter>' +
                  '<Parameter name="password"></Parameter>' +
                  '<Parameter name="table">(select * from ' + req.params.layer + ') as test</Parameter>' +
                  '<Parameter name="extent">-180,-90,180,89.99</Parameter>' +
                  '<Parameter name="estimate_extent">true</Parameter>' +
              '</Datasource>' +
          '</Layer>' +
        '</Map>';

  var xml = shp_xml;

  setBridge('test', xml, function(bridge, source) {
    if(req.params.request === 'info') {
      getInfo(source, req.params.layer, res);
    } else {
      getTile(bridge, req.params.x,req.params.y,req.params.z,req.params.format,res);
    }
  });
});


app.listen(3000);
console.log('Running at 3000');
console.log('/map', '= map client');
console.log('/' + vectorserver_path, '= vector proxy server');
