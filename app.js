const port = process.env.PORT || 2345;
const url = require('url');
const locations = require('./locations/locations.js');

const express = require('express');
const app = express();
const {check, validationResult} = require('express-validator');
/*
    I think in general doing an mvp using vanilla http server is fine, but since its very easy to use/install express
    and it  provides a bunch useful of middleware (validation, params/query access, logging, etcetc), I think it makes
    sense to use it. As a project grows it'll probably end up needing some sort of api framework.
 */

app.listen(port, () => console.log(`Server running listening on port ${port}.`));
/*
    it's better to extract the validation of a request from the actual processing of that request. It simplifies reading
    the code and follows the "single responsibility" principle. It also makes sense to leverage a library where you can
    instead of rolling your own, for convenience and for speed. (Even though here the validation isn't quite right, but
    i just wrote it as an example
 */
let validationChains = [
    check('q').not().isEmpty().isString(),
    check('longitude').optional().not().isEmpty().isNumeric(),
    check('latitude').optional().not().isEmpty().isNumeric()
];

app.get('/suggestions', validationChains, (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(422).json({errors: errors.array()});
    }
    const queryString = url.parse(req.url, true).query;
    locations.search(queryString, function (err, suggestions) {
        if (err) {
            console.log(err);
            // I'm of the opinion (now) that tss perfectly fine to return empty results with a status 200...
            // sometimes it happens, especially in this case where you're unsure what to find. I think 404 should be
            //really used for like..."this doesnt exist dude"
            return res.status(500).json(err);
        } else {
            res.writeHead('200', {"Content-Type": "application/json; charset=utf-8;"});
            res.end(JSON.stringify({suggestions: suggestions}, null, 2));
        }
    });
});

module.exports = app;
