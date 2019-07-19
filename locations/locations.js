const mongoose = require('mongoose');
const locationObject = require('./location-schema');

let redisClient;
/*
    Redis used as a cache only increases the efficiency/response time of  of the api. But it adds no _functionality_
    It shouldn't be mandatory to have redis to run the application. In fact should redis fail/connection lost, the app
    should theoretically still run (albeit slower). However here we'd simply crash! We can't even run/run tests
    locally without starting up a redis instance....which is really annoying/bad design.
 */
//Redis to go for heroku
if (process.env.REDISTOGO_URL) {
    const rtg = require("url").parse(process.env.REDISTOGO_URL);
    redisClient = require("redis").createClient(rtg.port, rtg.hostname);
    redisClient.auth(rtg.auth.split(":")[1]);
} else {
    redisClient = require("redis").createClient();
}

mongoose.connect('mongodb://localhost/location-db', function (err) {
    if (err) {
        console.log('connection error', err);
    } else {
        console.log('connection to db successful');
    }
});

/*
    I kind of see what you were going for here; some sort of smart search which could guess what the user
    meant to say. Let me just say search is _hard_. There are libraries out there both commercial/open source which
    dedicate to solving just that. So I think the scope of the problem (for this challenge at least) should be realistic
    and stick to a simpler requirement. I think the prefix match or a simple 'contains' on the name pass is fine for
    this.

    That said, you could have split the names of cities into character n-grams
    (i.e. ['mont', 'ontr', 'ntre', 'trea', 'real', 'mo', ...etc] and create a $text search index on them in mongo. Some
    tweaking for the exact ngram size to use would be necessary but I think you'd get some good results.
 */
function createRegex(cityName) {
    let regex = "";
    //too convoluted for what I wanted to do. With more time maybe allowing for mistakes/mispelling could
    //be handled more gracefully.
    /*for (var i = 1, len = cityName.length; i < len; i++) {
	regex = regex + '^' + cityName.substring(0,i) + '.' +  cityName.substring(i+1,len) + '|'; 
    }*/
    regex = regex + '^' + cityName;

    //remove last pipe
    //regex = regex.substr(0, regex.length - 1);
    //regex = regex + '/';
    return regex;
}
/*
    constructParams is very vague, and actually means very little. It even takes a 'params' param but ins't used?
    The naming is also a bit off, as 'aggregates' aren't a thing. An mongo 'aggregate' consists of several 'stages'.

    And really there's so much going on in this function; alot of conditional logic based on the querystring. All this
    should be split into 2 functions, which would return streams which would be filtered on/read from.

    searchByName(cityName) {
	    return mongo.aggregate([matchNameStage(cityName), limitStage(), projectStage()]).stream();
    }

    searchByNameAndLatLong(cityName, lat, lng) {
	    return mongo.aggregate([matchNameStage(cityName), nearLatLngStage(lat, lng), limitStage(), projectStage()]).stream();
    }

    and then this would be used like so
        return searchByName(cityName).filter( doc => computeNameScore(doc, cityName) > 0). ....

    which the caller could use to write back to the response stream.


 */
function constructParams(queryString, params) {
    const aggregates = [];
    //geoNear aggregate will sort the cities by proximity to the input (longitude,latitude) coordinates
    //makes use of the mongodb 2dsphere index for quick results over large data sets
    //keep only cities populated > 5000
    const geoNear = {
        $geoNear: {
            near: {type: "Point", coordinates: [parseFloat(queryString.longitude), parseFloat(queryString.latitude)]},
            distanceField: "dist.calculated",
            spherical: true,
            query: {population: {$gt: 5000}},
            //why the arbitrary limit of 100000 ?
            limit: 100000
        }
    };
    //match the query name against the generated regex. Regex deals only in ASCII.
    //TODO: have language option?
    const matchName = {
        $match: {
            ascii: {$regex: "filler", $options: 'i'},
            population: {$gt: 5000},
        }
    };
    const limit = {
        $limit: 20
    };
    //project only the needed fields to the next aggregate stage
    const project = {
        $project: {
            "name": {$concat: ["$ascii", ", ", {$substr: ["$admin1", 0, 2]}, ", ", "$country"]},
            "loc": 1,
            "dist.calculated": 1,
            "population": 1,
            "_id": 1,
            "ascii": 1
        }
    };
    //push the geoNear stage if the user put in longitude/latitude.
    //limit results if no name was entered to 10 closest cities.
    if (queryString.longitude !== undefined && queryString.latitude !== undefined) {
        if (queryString.q === undefined)
            geoNear.$geoNear.limit = 10;
        aggregates.push(geoNear);
    }

    //generate the prefix regex match. Prefix makes use of the mongo db index.
    if (queryString.q !== undefined) {
        matchName.$match.ascii.$regex = createRegex(queryString.q);
        aggregates.push(matchName);
    }
    if (queryString.limit !== undefined)
        limit.$limit = parseInt(queryString.limit);

    aggregates.push(limit, project);
    return aggregates;
}

//compute the score of both the geolocation and the name
//for geoscore we remove 0.1/100km.
//for the namescore, since I'm not implementing any spelling error and we're matching on the prefix
//all results returned will have high confidence
/*
    So many if statements here again. separating into computeNameScore() and computeLatLngScore() would be much cleaner.
    And then a computeNameAndLatLngScore() so we could even decide how to weigh the namescore vs the latlng score.
 */
function computeScore(queryString, locationName, distance) {
    let nameScore = 1;
    let geoScore = 1;
    let totalScore = 0;
    if (queryString.q != null) {
        const common = locationName.replace(queryString.q, "");
        if (common.length == 0)
            nameScore = 1;
        else
            nameScore = 0.9;
        totalScore += nameScore;
    }
    if (queryString.longitude != null && queryString.latitude != null) {
        geoScore = 1 - (distance.calculated / 1000000)
        totalScore += geoScore;
    }
    // always use if() {...}. Avoids scope mistakes
    if (queryString.q != null && queryString.longitude != null && queryString.latitude != null)
        return (totalScore / 2);
    return totalScore;
}

//first check redis in memory for the queried term. If there is no result, we go to mongo.
//ideally, redis would sit on a server different than mongo since they have conflicting approaches for using 
//memory. (mongo scales well with OS memory-swapping but redis does not)
const locations = {
    search: function (queryString, callback) {
        //query redis first
        redisClient.get("query_" + JSON.stringify(queryString), function (err, redisResults) {
            if (err || !redisResults) {
                locationObject.aggregate(constructParams(queryString, null), function (err, locs) {
                    if (err) {
                        console.log(err);
                        callback(err, []);
                    } else {
                        //compute score. It would have been nice to do this in the aggregate stage but mongo
                        //doesn't deal well with string operations inside aggregate.
                        const filteredLocs = [];
                        locs.forEach(function (doc) {
                            doc.score = computeScore(queryString, doc.ascii, doc.dist);
                            if (doc.score > 0) {
                                filteredLocs.push(doc);
                            }
                        });
                        //cache result into redis. Store only temporarily
                        redisClient.setex("query_" + JSON.stringify(queryString), 21600, JSON.stringify(filteredLocs, null, 2));
                        callback(null, filteredLocs);
                    }
                });
            } else {
                //parse results back into json since redis stores values as strings
                callback(null, JSON.parse(redisResults));
            }
        });
    }
};

module.exports = locations;
