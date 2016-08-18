var http = require("http"),
    qs = require("querystring"),
    path = require("path"),
    fs = require("fs");

var books = {};

var getData = (req, cb) => {
    var data = "";

    LOG("getting data");
    req.on("data", chunk => data += chunk);

    req.on("end", () => {
        // LOG("parsing");
        var params = qs.parse(data);

        // LOG("passing to handler");
        cb(params);
    });
};

var id = x => x;
var toString = val => val.toString();
var constant = val => () => val;

var serializers = {
    string: id,
    boolean: toString,
    object: obj => JSON.stringify(obj),
    date: date => date.toISOString(),
    undefined: constant("")
};

var serialize = val => serializers[typeof val](val);

var writeReturn = (res, func) => (...args) => {
    var returnVal = serialize(func(...args));

    // LOG(`returned: ${returnVal}`);
    res.end(returnVal);
};

var dbFilePath = path.join(__dirname, "books.json");

var LOG = message => console.log(message);

var createDbFile = data => {
    LOG(`creating db file at ${dbFilePath}`);

    // LOG(`data ${Object.keys(data)} ${serialize(data)}`);
    fs.writeFile(dbFilePath, serialize(data), err => {
        if(err) {
            console.log("error:" + err);
            throw new Error(`could not create db file: ${err.message}`);
        }

        LOG("db file created");
    });
};

var toPairs = obj => Object.keys(obj).map(key => [key, obj[key]]);

var merge = a => ({
    into: b => toPairs(a).forEach(pair => {
        var bVal = b[pair[0]];
        if(bVal && !!bVal.count) {
            LOG(`incremented count to ${++bVal.count}`)
            return;
        }

        b[pair[0]] = pair[1];
    })
});

var syncBooks = cb => {
    fs.readFile(dbFilePath, "utf8", (err, data) => {
        if(err) {
            LOG("db file not found");
            createDbFile(books);

            cb(books);
        }

        var loadedBooks;
        try {
            loadedBooks = JSON.parse(data);
        } catch(e) {
            loadedBooks = {};
        }

        LOG("merging dbs");
        merge(books).into(loadedBooks);
        fs.writeFile(dbFilePath, serialize(loadedBooks), err => {
            if(err)
                throw new Error(err.message);

            books = loadedBooks;
            LOG("db synchronized");
            cb(loadedBooks);
        });
    });
};

var addBook = ({code, box}) => {
    books[code] = {
        id: code,
        box: box,
        added: new Date(),
        count: 0
    };

    syncBooks(() => LOG(`added book ${code} to box: ${box}`));
};

var listBooks = () => {
    LOG("listing books");
    return books;
};

var methodWrappers = {
    POST: (req, res) => handler => getData(req, writeReturn(res, handler)),
    GET: (req, res) => handler => writeReturn(res, handler)()
};

var hashRequest = req => `${req.method} ${req.url}`;

var handleReq = (req, res) => {
    var reqKey = hashRequest(req);
    LOG(`request: ${reqKey}`);

    var handler = routes[reqKey];
    if(!handler) {
        res.setHead(404);
        res.end();
        return;
    }

    methodWrappers[req.method](req, res)(handler);
}

var routes = {
    "POST /book": addBook,
    "GET /book": listBooks
};

var server = http.createServer(handleReq);

var init = () => {
    syncBooks(books => {
        LOG(`loaded db: ${Object.keys(books).length} books`);

        server.listen(8080);
        LOG("app live");
    });
};

init();
