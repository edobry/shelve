var http = require("http"),
    path = require("path"),
    fs = require("fs");

var books = {};

var parseData = params => params.split(';')
    .map(param => param.split('='))
    .reduce((obj, param) => {
        obj[param[0]] = param[1];
        return obj;
    }, {});

var getData = (req, cb) => {
    var data = "";

    req.on("data", chunk => data += chunk);
    req.on("end", () => {
        //console.log(`data: ${data}`);

        var params = parseData(data);
        cb(params);
    });
};

var serializers = {
    "string": val => val.toString(),
    "boolean": val => val.toString(),
    "object": obj => JSON.stringify(obj),
    "undefined": obj => ""
};

var serialize = val => serializers[typeof val](val);

var writeReturn = (res, func) => (...args) => res.end(serialize(func(...args)));

var dbFilePath = path.join(__dirname, "books.json");

var LOG = message => console.log(message);

var createDbFile = data => {
    LOG(`creating db file at ${dbFilePath}`);

    console.log("data", data);
    fs.writeFile(dbFilePath, JSON.stringify(data), err => {
        if(err) {
            console.log("error:" + err);
            throw new Error(`could not create db file: ${err.message}`);
        }

        LOG(`db file created at ${dbFilePath}`);
    });
};

var toPairs = obj => Object.keys(obj).map(key => [key, obj[key]]);

var merge = a => ({
    into: b => toPairs(a).forEach(pair => b[pair[0]] = pair[1])
});

var syncBooks = cb => {
    fs.readFile(dbFilePath, "utf8", (err, data) => {
        if(err) {
            LOG("db file not found");
            createDbFile(books);
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
    })
};

var addBook = ({code}) => {
    books[code] = { id: code };

    syncBooks(() => LOG(`added book: ${code}`));
};

var listBooks = () => {
    console.log("listing books");
    return books;
};

var routes = {
    "POST /book": (req, res) => getData(req, writeReturn(res, addBook)),
    "GET /book": (req, res) => writeReturn(res, listBooks)()
};

var hashRequest = req => `${req.method} ${req.url}`;

var server = http.createServer((req, res) => {
    var reqKey = hashRequest(req);

    console.log(`request: ${reqKey}`);

    var handler = routes[reqKey];
    if(!handler) {
        res.end();
        return;
    }

    handler(req, res);
});

var init = () => {
    syncBooks(books => {
        LOG(`loaded db: ${Object.keys(books).length} books`);

        server.listen(8080);
        LOG("app live");
    });
};

init();
