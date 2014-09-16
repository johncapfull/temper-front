var http = require('http');
var sqlite3 = require('sqlite3');
var express = require('express');
var compression = require('compression');
var bodyParser = require('body-parser')

// Read local configuration
var config = require('./config/config.js')

var db;

function createTable(callback) {
    db.run("CREATE TABLE temperature(time bigint, celsius real)", callback);
}

function initDatabase(callback) {
    db = new sqlite3.Database(config.db.filename, function() {
        db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='temperature';", 
                function(err, rows) {
            if (rows.length == 0) {
                createTable(callback);
            } else {
                callback();
            }
        });
    });
}

function dateToUnixTime(date) {
    return Math.floor(date.getTime() / 1000);
}

///////////////////////////////////////////////////////////////////////////
// Write a single temperature record in JSON format to database table.

function insertTemp(values) {
    var statement = db.prepare("INSERT INTO temperature VALUES (?, ?)");

    for (var i = 0; i < values.length; i++) {
        var value = values[i];
        if (!value.celsius || !value.time) {
            throw new Error('invalid insert request -- no celsius or time values');
        }

        var celsius = parseFloat(value.celsius);
        var time = new Date(value.time);

        if (isNaN(time.getTime()) || isNaN(celsius)) {
            throw new Error('invalid time/temperature format');
        }

        // Unix time is in seconds, but javascript provide milliseconds
        statement.run(dateToUnixTime(time), celsius);
    }
    statement.finalize();
}

// Get temperature records from database
function selectTemp(count, startDate, callback) {
    var start = dateToUnixTime(startDate);
    
    db.all("SELECT * FROM (SELECT * FROM temperature WHERE time >= (?) ORDER BY time DESC LIMIT ?) ORDER BY time;", 
            start, count, callback);
};

/////////////////////////////////////////////////////////

function handleNotFound(req, res) {
      res.status(404).sendFile(__dirname + '/static/404.html');
}

/////////////////////////////////////////////////////////

function handleError(err, req, res, next) {
    console.error(err.stack);
    
    res.status(500).end(
        'Internal server error:\n' + 
        err +
        '\n\n' +
        'Original query:\n' + 
        JSON.stringify(res.query));
}
/////////////////////////////////////////////////////////

function handleAbout(req, res) {
      res.send('Hello World');
}

function handleInsert(req, res) {
    insertTemp([req.query]);
    res.end('Success');
}

function handleInsertJSON(req, res) {
    // Format:
    // [{"celcius" : "10", "time" : "1970-01-01T01:00"}, ...]

    if (!req.body || !req.body.length || req.body.length == 0) {
        throw new Error('array have invalid format');
    }

    insertTemp(req.body);
    res.json({result : "success"});
}

/////////////////////////////////////////////////////////

function queryTemperature(req, res) {
    var query = req.query;
    
    var startDate = new Date(0);
    var count = -1;

    if (query.count) {
        count = parseInt(query.count);
    }

    if (query.start_date) {
        startDate = new Date(query.start_date);
    }

    // Send a message to console log
    console.log('Database query request from '+ req.connection.remoteAddress +
        ' for ' + count + ' records from ' + startDate + '.');

    selectTemp(count, startDate, function(err, data) {
        if (err) {
            // Error
            res.writeHead(500, { "Content-type": "text/plain" });
            res.write('Error serving querying database.\n' + err);
            res.write('\n');
            res.write('Original query:\n' + JSON.stringify(query));
            res.end('\n');            
        } else {
            // Success
            res.json(data);
        }
    });
}

////////////////////////////////////////////////////////
// Server

function run() {
    var app = express();

    // Base url
    var base = config.url.base;

    // Enable compression for large files
    app.use(compression({ threshold: 512 }));
    app.use(bodyParser.json())

    app.use(base, express.static(__dirname + '/static'));

    // Error handler
    app.use(handleError);

    var server = app.listen(config.port, config.host, function() {
        console.log('Listening on port %d', server.address().port);
    });

    // Router
    app.get  (base + '/about', handleAbout);
    app.get  (base + '/add', handleInsert);
    app.post (base + '/add.json', handleInsertJSON);
    app.get  (base + '/query', queryTemperature);
    app.get  (base +'*', handleNotFound);
}

initDatabase(function() {
    run();
});
