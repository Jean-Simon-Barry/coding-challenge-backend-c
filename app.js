var http = require('http');
var port = process.env.PORT || 2345;
var locations = require('./data/location-schema');
var url = require('url');

var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/location-db', function(err) {
    if(err) {
        console.log('connection error', err);
    } else {
        console.log('connection to db successful');
    }
});

module.exports = http.createServer(function (req, res) {

    //use express routes here instead?
    if (req.url.indexOf('/suggestions') === 0) {
	var queryString = url.parse(req.url, true).query;
	console.log('query is' + JSON.stringify(queryString));
	//need to search in more than ascii and name
	//need to search for lat and longetitude
	locations.find({ascii:{$regex : queryString.q, $options:'i'}, population : { $gt : 5000}},function (err, locations) {
	    if(err){
		console.log(err);
	    }
	    else{
		console.log("everything cool");
		res.end(JSON.stringify(locations.name, null, 2));
		//console.log(locations[0]);
	    }
	});
		  
    }
    else{
	res.end();
    }
  }).listen(port, '127.0.0.1');

console.log('Server running at http://127.0.0.1:%d/suggestions', port);
