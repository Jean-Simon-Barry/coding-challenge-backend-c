var http = require('http');
var port = process.env.PORT || 2345;

module.exports = http.createServer(function (req, res) {

    //use express routes here instead?
    if (req.url.indexOf('/suggestions') === 0) {
	var queryString = url.parse(req.url, true).query;
	console.log('query is' + JSON.stringify(queryString));
	locations.search(queryString, function(err, suggestions){
	    if(err)
		console.log(err);
	    else
		//TODO:set content and header
		res.end(JSON.stringify(suggestions, null, 2));
	});
		  
    }
    else{
	//TODO:set content and header
	res.end();
    }
  }).listen(port, '127.0.0.1');

console.log('Server running at http://127.0.0.1:%d/suggestions', port);
