//  OpenShift sample Node application
var express = require('express'),
    app     = express(),
    bunyan  = require('bunyan),
    ebl     = require('express-bunyan-logger');

var log = bunyan.createLogger({name: "nodejs-ex"});
    
Object.assign=require('object-assign')

app.engine('html', require('ejs').renderFile);
app.use(ebl())

var port = process.env.PORT || process.env.OPENSHIFT_NODEJS_PORT || 8080,
    ip   = process.env.IP   || process.env.OPENSHIFT_NODEJS_IP || '0.0.0.0',
    mongoURL = process.env.OPENSHIFT_MONGODB_DB_URL || process.env.MONGO_URL,
    mongoURLLabel = "";

if (mongoURL == null) {
  var mongoHost, mongoPort, mongoDatabase, mongoPassword, mongoUser;
  // If using plane old env vars via service discovery
  if (process.env.DATABASE_SERVICE_NAME) {
    var mongoServiceName = process.env.DATABASE_SERVICE_NAME.toUpperCase();
    mongoHost = process.env[mongoServiceName + '_SERVICE_HOST'];
    mongoPort = process.env[mongoServiceName + '_SERVICE_PORT'];
    mongoDatabase = process.env[mongoServiceName + '_DATABASE'];
    mongoPassword = process.env[mongoServiceName + '_PASSWORD'];
    mongoUser = process.env[mongoServiceName + '_USER'];

  // If using env vars from secret from service binding  
  } else if (process.env.database_name) {
    mongoDatabase = process.env.database_name;
    mongoPassword = process.env.password;
    mongoUser = process.env.username;
    var mongoUriParts = process.env.uri && process.env.uri.split("//");
    if (mongoUriParts.length == 2) {
      mongoUriParts = mongoUriParts[1].split(":");
      if (mongoUriParts && mongoUriParts.length == 2) {
        mongoHost = mongoUriParts[0];
        mongoPort = mongoUriParts[1];
      }
    }
  }

  if (mongoHost && mongoPort && mongoDatabase) {
    mongoURLLabel = mongoURL = 'mongodb://';
    if (mongoUser && mongoPassword) {
      mongoURL += mongoUser + ':' + mongoPassword + '@';
    }
    // Provide UI label that excludes user id and pw
    mongoURLLabel += mongoHost + ':' + mongoPort + '/' + mongoDatabase;
    mongoURL += mongoHost + ':' +  mongoPort + '/' + mongoDatabase;
  }
}
var db = null,
    dbDetails = new Object();

var initDb = function(callback) {
  if (mongoURL == null) return;

  var mongodb = require('mongodb');
  if (mongodb == null) return;

  mongodb.connect(mongoURL, function(err, conn) {
    if (err) {
      callback(err);
      return;
    }

    db = conn;
    db.collection('counts').createIndex('host', {background:true, w:1});
    dbDetails.databaseName = db.databaseName;
    dbDetails.url = mongoURLLabel;
    dbDetails.type = 'MongoDB';

    log.info('Connected to MongoDB at: %s', mongoURL);
  });
};

app.get('/', function (req, res) {
  // try to initialize the db on every request if it's not already
  // initialized.
  if (!db) {
    initDb(function(err){});
  }
  if (db) {
    var col = db.collection('counts');
    // Create a document with request IP and current time of request
    col.insert({host: os.hostname(), ip: req.ip, date: Date.now()});
    col.count(function(err, count){
      if (err) {
        log.info('Error running count. Message:\n'+err);
      }
      //res.render('index.html', { pageCountMessage : count, dbInfo: dbDetails });
      gcount = count; // total line count
    });
    // request from specific host to demonstrate what happens when scaling or changing pod
    col.count({host: os.hostname()}, function(err, count){
      res.render('index.html', { pageCountMessage : gcount, localCountMessage: count, dbInfo: dbDetails, host: os.hostname() });
    });
  } else {
    res.render('index.html', { pageCountMessage : null});
  }
});

app.get('/pagecount', function (req, res) {
  // try to initialize the db on every request if it's not already
  // initialized.
  if (!db) {
    initDb(function(err){});
  }
  if (db) {
    db.collection('counts').count(function(err, count ){
      res.send('{ pageCount: ' + count + '}');
    });
  } else {
    res.send('{ pageCount: -1 }');
  }
});

app.get('/dropdb', function (req, res) {
  if (db) {
    db.collection('counts').drop(function(err, reply ){
      db.collection('counts').createIndex('host', {background:true, w:1});
      res.send('{ Drop result: ' + reply + '}');
    });
  } else {
    res.send('{ Nothing to drop: -1 }');
  }
});

// specific health endpoint to not increment pagecount with kube healthcheck
app.get('/health', function (req, res) {
    res.send('I am healthy');
});

// error handling
app.use(function(err, req, res, next){
  log.error(err.stack);
  res.status(500).send('Something bad happened!');
});

initDb(function(err){
  log.info('Error connecting to Mongo. Message:\n'+err);
});

app.listen(port, ip);
log.info('Server running on http://%s:%s', ip, port);

module.exports = app ;
