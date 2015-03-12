var conn = new Mongo();
var db = conn.getDB("location-dbxx");
db.locations.createIndex({name : "text"});
