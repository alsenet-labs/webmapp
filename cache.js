/*
 * cache.js
 *
 * Copyright (c) 2016 ALSENET SA
 *
 * Author(s):
 *
 *      Rurik Bugdanov <rurik.bugdanov@alsenet.com>
 * *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * Additional Terms:
 *
 *      You are required to preserve legal notices and author attributions in
 *      that material or in the Appropriate Legal Notices displayed by works
 *      containing it.
 *
 *      You are required to attribute the work as explained in the "Usage and
 *      Attribution" section of <http://doxel.org/license>.
 */

module.exports=function(config){
var http = require('http');
var url = require('url');
var path=require('path');
var fs=require('fs');
var dl=require('./downloadq.js');
var extend=require('extend');

config=config||{};

if (fs.existsSync('./cache.config.json')) {
  config=extend(config,require('./cache.config.json'));
}

var cachedir=config.cachedir||path.join(__dirname,'cache');

fs.existsSync(cachedir) || fs.mkdirSync(cachedir);

if (config.middleware) {
  return {
    middleware: {
      get: onRequest
    }
  };
} else {
 http.createServer(onRequest).listen(config.port||3129);
}

function mkdir(dirname,callback){
  var dir='';
  var i=0;

  var _path=dirname.split('/');
  if (dirname.charAt(0)=='/') {
    _path[0]='/';
  }

  function next() {
    ++i;
    iter();
  }

  function iter(){
    if (i<_path.length) {
      dir=path.join(dir,_path[i]);
      fs.exists(dir,function(doexists){
        if (doexists) {
          next();
        } else {
          fs.mkdir(dir,next);
        }
      });
    } else {
      callback();
    }
  }

  if (fs.exists(dirname,function(doexists){
    return (doexists)?callback():iter();
  }));

} // mkdir

function onRequest(req, res, next) {
  function abort(e) {
    console.log(e.message,e.stack);
    res.statusCode=500;
    res.statusMessage=e.message;
    res.end(e.message);
  }

  var queryData = url.parse(req.url, true).query;
  if (queryData.url) {
    try {
      var _url=queryData.url.match(/([^:]+:\/+([^\/]+))\/(.*)/);
      var origin=_url[1];
      var host=_url[2];
      var filepath=_url[3];

      var subdir=queryData.root||host;
      var filecache=path.join(cachedir,subdir,filepath);
      if (filecache.substr(0,cachedir.length)!=cachedir) {
        throw(new Error('Path not authorized: '+filecache));
      }

      fs.exists(filecache,function(doexists){
        if (doexists) {
          console.log('cached: ',filecache);
          fs.createReadStream(filecache).pipe(res);

        } else {
          mkdir(path.dirname(filecache),function(){
            console.log('caching:',filecache);
            dl.download({
              download: {
                url: origin+'/'+filepath,
                dest: filecache,
                pipe: res
              }
            })
            .then(function(options){
              var response=options.download.response;
              if (response.statusCode<200 || response.statusCode>=300) {
                try {
                  fs.unlinkSync(filecache);
                } catch(e) {}
                console.log(response.statusCode + ' ' + response.statusMessage);
                abort(new Error(response.statusCode + ' ' + response.statusMessage));
              }
            })
            .fail(abort)
            .done();
          });
        }
      });

    } catch(e) {
      abort(e);
    }

  } else {
    abort("no url found");
  }
}

}
