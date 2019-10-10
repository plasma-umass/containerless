let containerless = require('../dist/index');

// https://cloud.google.com/datastore/docs/reference/data/rest/v1/projects/commit

// 1. gcloud auth activate-service-account --key-file keys/umass-plasma-980eb8bee293.json
// 2. gcloud auth print-access-token

/*
Cannot use functions in object ?
*/

let transaction = undefined;
let mutations = [];

function checkTransaction(req, next) {
    if(transaction === undefined) {
        containerless.respond("You must begin a transaction first.");
    } else {
        next(req);
    }
}

function begin(req) {
    containerless.post({
        'url':"https://datastore.googleapis.com/v1/projects/umass-plasma:beginTransaction?access_token=" + req.body.accessToken,
        'body':{
            "transactionOptions": {
              "readWrite": {
                "previousTransaction": ""
              }
            }
          }
    }, function(resp) {
        if(resp.error !== undefined) {
            containerless.respond("error");
        } else {
            transaction = resp.transaction;
            containerless.respond("Begin transaction. Commit transaction with /commit.");
        }
    });
}

function commit(req) {
    containerless.post({
        'url':'https://datastore.googleapis.com/v1/projects/umass-plasma:commit?access_token=' + req.body.accessToken,
        'body': {
            "transaction": transaction,
            "mode": "TRANSACTIONAL",
            "mutations": mutations
          }
    }, function(resp) {
        if(resp.error !== undefined) {
            containerless.respond("error");
        } else {
            transaction = undefined;
            mutations = [];
            containerless.respond("Done!");
        }
    });
}

function balance(req, next) {
    containerless.post({
        'url':'https://datastore.googleapis.com/v1/projects/umass-plasma:lookup?access_token=' + req.body.accessToken,
        'body': {
            "readOptions": {
              "transaction": transaction
            },
            "keys": [
              {
                "partitionId": {
                  "namespaceId": "",
                  "projectId": "umass-plasma"
                },
                "path": [
                  {
                    "id": req.body.id,
                    "kind":"Account"
                  }
                ]
              }
            ]
          }
    }, function(resp) {
        if(resp.error !== undefined) {
            containerless.respond("error");
        } else {
            next(resp);
        }
    });
}

function withdraw(req) {
    balance(req, function(resp) {
        let key = resp.found[0].entity.key;
        let baseVersion = resp.found[0].version;
        let props = resp.found[0].entity.properties;
        props.Balance.integerValue = props.Balance.integerValue - req.query.amount;
        let mutation = {
            'update': {
                'key': key,
                'properties': props
            },
            'baseVersion': baseVersion
        };
        mutations.push(mutation);
        containerless.respond("Withdraw logged!");
    });
}

function deposit(req) {
    balance(req, function(resp) {
        let key = resp.found[0].entity.key;
        let baseVersion = resp.found[0].version;
        let props = resp.found[0].entity.properties;
        props.Balance.integerValue = props.Balance.integerValue - (req.query.amount - (req.query.amount * 2));
        let mutation = {
            'update': {
                'key': key,
                'properties': props
            },
            'baseVersion': baseVersion
        };
        mutations.push(mutation);
        containerless.respond("Deposit logged!");
    });
}

containerless.listen(function(req) {
    if(req.path === '/begin') {
        begin(req);
    } else if(req.path === '/commit') {
        checkTransaction(req, commit);
    } else if(req.path === '/balance') {
        checkTransaction(req, function(req) {
            balance(req, function(resp) {
                containerless.respond(resp.found[0].entity.properties.Balance.integerValue);
            });
        });
    } else if(req.path === '/withdraw') {
        checkTransaction(req, withdraw);
    } else if(req.path === '/deposit') {
        checkTransaction(req, deposit);
    } else {
        containerless.respond("Unknown command.");
    }
});