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
	
	//need to search for lat and longetitude if present
	//need to sanitize query input
	//locations.aggregate( [ { $match: { $text : { $search : queryString.q } } }, 
	locations.aggregate( [ { $match: { name : { $regex : new RegExp("^"+queryString.q), $options:'i' } } }, 
			       { $sort: { score: { $meta: "textScore" }, name: 1 } },
			       { $project : { "ascii" : 1, 
					    "name" : 1, 
					    "country" : 1, 
					    "lat" : 1, 
					    "longitude" : 1,
					    "admin1" : 1,
					    "score" : 1}}], function(err, locs){
	    if(err){
		console.log(err);
		res.end([]);
	    }
	    
	    else{
		console.log("everything cool");
		console.log(locs[1]); //testing
		res.end(JSON.stringify(locs, null, 2));
	    }
	});


	/*locations.find({ascii:{$regex : new RegExp('^'+queryString.q), $options:'i'}, 
			population : { $gt : 5000}, 
			country : { $in : ["US", "CA"]}},
		       function (err, locations) {
	    if(err){
		console.log(err);
	    }
	    else{
		console.log("everything cool");
		res.end(JSON.stringify(locations, null, 2));
		//console.log(locations[0]);
	    }
	});*/
		  
    }
    else{
	res.end();
    }
  }).listen(port, '127.0.0.1');

console.log('Server running at http://127.0.0.1:%d/suggestions', port);
