import * as request from 'request';
import * as express from 'express';
import * as os from 'os';
import * as bodyParser from "body-parser";
import * as state from './state';
import { newTrace } from './tracing';
import { newMockTrace } from './mockTracing';
import { number, identifier, string } from './exp';
import { TracingInterface } from './types';

const defaultEventArg = number(0);

export type Request = {
    path: string,
    query: JSON,
    body: JSON,
    requestID: string,
}

const hostname = os.hostname();

export class Callbacks {

    private app: express.Express | undefined;
    private response: Map<string, express.Response>; // express.Response | undefined;
    private responseID: string | undefined;
    public trace: TracingInterface;

    constructor() {
        this.app = undefined;
        this.response = new Map();
        this.responseID = undefined;
        this.trace = state.isTracing() ? newTrace() : newMockTrace();
    }

    /**
     * Executes a callback body in the context of its callback trace.
     *
     * @param trace Callback trace.
     * @param body Callback body.
     */
    private withTrace(trace: TracingInterface, responseID: string, body: () => void) {
        let outerTrace = this.trace;
        let outerResponseID = this.responseID;
        this.trace = trace;
        this.responseID = responseID;
        trace.newTrace();
        let result = body();
        trace.exitBlock();
        trace.newTrace();
        this.trace = outerTrace;
        this.responseID = outerResponseID;
        return result;
    }

    /**
     * Mock callback function used for testing.
     *
     * 1. Creates a callback trace.
     * 2. Wraps the callback trace with the callback body.
     * 3. Returns 2 as a function.
     *
     * @param callback
     */
    mockCallback(callback: (value: any) => void, arg: any): ((value: any) => void) {
        const [_, callbackClos, argRep] = this.trace.popArgs();
        let innerTrace = this.trace.traceCallback('mock', argRep, ['clos', 'response'], callbackClos);
        let innerResponseID = "0";
        return (value: any) => {
            this.withTrace(innerTrace, innerResponseID, () => {
                innerTrace.pushArgs([identifier('clos'), identifier('response')]);
                callback(value);
            });
        };
    }

    private getResponseIDOrError(): string {
        if(this.responseID === undefined) {
            throw Error("undefined id");
        } else {
            return this.responseID;
        }
    }

    /**
     * Passes a callback to setImmediate().
     *
     * 1. Creates a callback trace.
     * 2. Wraps the callback trace with the callback body.
     * 3. Passes 2 as a callback to setImmediate().
     *
     * @param eventArgStr
     * @param callback
     */
    immediate(callbackArgStr: string, callback: (callbackArg: string) => void) {
        const [_, argRep, callbackClos] = this.trace.popArgs();
        let innerTrace = this.trace.traceCallback('immediate', argRep, ['clos', 'x'], callbackClos);
        let innerResponseID = "1";
        setImmediate(() => {
            this.withTrace(innerTrace, innerResponseID, () => {
                innerTrace.pushArgs([identifier('clos'), identifier('x')]);
                callback(callbackArgStr);
            });
        });
    }

    /**
     * Issues an HTTP GET request.
     *
     * @param uri URL for the request. If the URL begins with "data:", then we
     *            use the rest of the string is as the JSON response, and do not
     *            issue a GET request.
     * @param callback receives the request body or undefined if request failed
     */
    get(
        uri: string,
        callback: (response: undefined | JSON) => void) {
        // TODO(arjun): string(uri) is not right. This needs to be the expression
        // passed to the function.
        let [_, $argRep, $callbackClos] = this.trace.popArgs();
        let innerTrace = this.trace.traceCallback('get', $argRep, ['clos', 'response'], $callbackClos);
        let innerResponseID = this.getResponseIDOrError();
        if (uri.startsWith('data:')) {
            this.withTrace(innerTrace, innerResponseID, () => {
                innerTrace.pushArgs([identifier('clos'), identifier('response')]);
                callback(JSON.parse(uri.substr(5)));
            });
            return;
        }

        if (state.getListenPort() === 'test') {
            this.withTrace(innerTrace, innerResponseID, () => {
                innerTrace.pushArgs([identifier('clos'), identifier('response')]);
                // TODO(arjun): We need to change this to test withot making
                // Internet connections.
                callback(JSON.parse(String('{ "username": "javascript", "password": "rust"}')));
            });
        } else {
            request.get(uri, undefined, (error, resp) => {
                //console.error(resp);
                this.withTrace(innerTrace, innerResponseID, () => {
                    innerTrace.pushArgs([identifier('clos'), identifier('response')]);
                    if (error !== null) {
                        callback(undefined);
                    }
                    else {
                        // TODO(arjun): Test case with nested closures
                        callback(JSON.parse(String(resp.body)));
                    }
                });
            });
        }
    }

    /**
     * Issues an HTTP POST request
     */
    post(uri: { url: string, body: JSON | string }, callback: (response: undefined | string) => void) {
        let [_, $argRep, $callbackClos] = this.trace.popArgs();
        let innerTrace = this.trace.traceCallback('post', $argRep, ['clos', 'response'], $callbackClos);
        let innerResponseID = this.getResponseIDOrError();
        if (uri.url.startsWith('data:')) {
            this.withTrace(innerTrace, innerResponseID, () => {
                innerTrace.pushArgs([identifier('clos'), identifier('response')]);
                callback(JSON.parse(uri.url.substr(5)));
            });
            return;
        }

        /*
        // https://stackoverflow.com/questions/37870594/how-to-post-with-request-in-express
        request(obj, function(error: any, response: any, body: any){
            console.log(body);
        });
        */

        if (state.getListenPort() === 'test') {
            this.withTrace(innerTrace, innerResponseID, () => {
                innerTrace.pushArgs([identifier('clos'), identifier('response')]);
                // TODO(emily): This is probably wrong.
                callback(JSON.parse(String('{ "body": "User not found."}')));
            });
        } else {
            if (typeof uri.body !== 'string') {
                uri.body = JSON.stringify(uri.body);
            }
            request.post(uri, (error: any, resp: any) => {
                this.withTrace(innerTrace, innerResponseID, () => {
                    innerTrace.pushArgs([identifier('clos'), identifier('response')]);
                    if (error !== null) {
                        console.error(error);
                        callback(undefined);
                    }
                    else {
                        // NOTE(emily): Change this to not be the stupid thing
                        callback(JSON.parse(String(resp.body)));
                    }
                });
            });
        }
    }

    // TODO(emily): Combine get, post, and put

    /**
     * Issues an HTTP PUT request
     */
    put(uri: { url: string, body: JSON | string }, callback: (response: undefined | string) => void) {
        let [_, $argRep, $callbackClos] = this.trace.popArgs();
        let innerTrace = this.trace.traceCallback('put', $argRep, ['clos', 'response'], $callbackClos);
        let innerResponseID = this.getResponseIDOrError();
        if (uri.url.startsWith('data:')) {
            this.withTrace(innerTrace, innerResponseID, () => {
                innerTrace.pushArgs([identifier('clos'), identifier('response')]);
                callback(JSON.parse(uri.url.substr(5)));
            });
            return;
        }

        if (state.getListenPort() === 'test') {
            this.withTrace(innerTrace, innerResponseID, () => {
                innerTrace.pushArgs([identifier('clos'), identifier('response')]);
                // TODO(emily): This is probably wrong.
                callback(JSON.parse(String('{ "body": "User not found."}')));
            });
        } else {
            if (typeof uri.body !== 'string') {
                uri.body = JSON.stringify(uri.body);
            }
            request.put(uri, (error: any, resp: any) => {
                this.withTrace(innerTrace, innerResponseID, () => {
                    innerTrace.pushArgs([identifier('clos'), identifier('response')]);
                    if (error !== null) {
                        console.error(error);
                        callback(undefined);
                    }
                    else {
                        //console.log(resp);
                        callback(JSON.parse(String(resp.body)));
                    }
                });
            });
        }
    }

    /**
     * Issues an HTTP DELETE request
     */
    delete(uri: string, callback: (response: undefined | string) => void) {
        let [_, $argRep, $callbackClos] = this.trace.popArgs();
        let innerTrace = this.trace.traceCallback('delete', $argRep, ['clos', 'response'], $callbackClos);
        let innerResponseID = this.getResponseIDOrError();
        if (uri.startsWith('data:')) {
            this.withTrace(innerTrace, innerResponseID, () => {
                innerTrace.pushArgs([identifier('clos'), identifier('response')]);
                callback(JSON.parse(uri.substr(5)));
            });
            return;
        }

        if (state.getListenPort() === 'test') {
            this.withTrace(innerTrace, innerResponseID, () => {
                innerTrace.pushArgs([identifier('clos'), identifier('response')]);
                // TODO(emily): This is probably wrong.
                callback(JSON.parse(String('{ "body": "User not found."}')));
            });
        } else {
            request.delete(uri, (error: any, resp: any) => {
                this.withTrace(innerTrace, innerResponseID, () => {
                    innerTrace.pushArgs([identifier('clos'), identifier('response')]);
                    if (error !== null) {
                        console.error(error);
                        callback(undefined);
                    }
                    else {
                        callback(JSON.parse(String(resp.body)));
                    }
                });
            });
        }
    }

    public tracedListenCallback(callback: (request: Request) => void) {
        let [_, $callbackClos] = this.trace.popArgs();
        let innerTrace = this.trace.traceCallback('listen', defaultEventArg, ['clos', 'request'], $callbackClos);
        return (req: Request) => {
            this.withTrace(innerTrace,  req.requestID, () => {
                innerTrace.pushArgs([identifier('clos'), identifier('request')]);
                if (typeof req === 'string') {
                    // TODO(arjun): This is a bit of a hack to allow us to
                    // test tracing by sending raw strings as input. We should
                    // instead put in the effort to construct mock request
                    // objects.
                    callback(req);
                }
                else {
                    callback({ path: req.path, query: req.query, body: req.body, requestID: req.requestID });
                }
            });
        };
    }

    private extractAndRememberRequestID(req: express.Request, resp: express.Response) {
        let id = req.header("Unique-ID");
        if(id === undefined) {
            throw Error('bad');
        } else {
            this.response.set(id, resp);
            this.responseID = id;
        }
        return id;
    }
    public listen(callback: (request: Request) => void) {
        let tracedCallback = this.tracedListenCallback(callback);
        this.app = express();
        this.app.use(bodyParser.json());
        this.app.use(bodyParser.urlencoded({ extended: false }));

        // There isn't anything inherently wrong with this, but calling listen
        // multiple times makes the application unpredictable.
        if (state.isListening()) {
            //console.error(`Serverless function called listen more than once`);
            process.exit(1);
        }
        state.setListening();

        // readiness
        this.app.get('/readinessProbe', (req, resp) => {
            resp.send('');
        });

        // clear the current trace
        this.app.get('/clear', (req, resp) => {
            this.trace.newTrace();
            resp.send('Cleared!');
        })

        // get the current trace
        this.app.get('/trace', (req, resp) => {
            resp.send(JSON.stringify(this.trace.getTrace()));
        });

        /**
         *  paths that applications can use
         */

        this.app.get('/', (req, resp) => {
            const id = this.extractAndRememberRequestID(req, resp);
            tracedCallback({ path: "", query: req.query, body: {} as any, requestID: id });
        });

        this.app.post('/', (req, resp) => {
            const id = this.extractAndRememberRequestID(req, resp);
            tracedCallback({ path: "", query: req.query, body: req.body, requestID: id });
        });

        this.app.get('/:path*', (req, resp) => {
            const id = this.extractAndRememberRequestID(req, resp);
            tracedCallback({ path: req.path, query: req.query, body: {} as any, requestID: id });
        });

        this.app.post('/:path*', (req, resp) => {
            const id = this.extractAndRememberRequestID(req, resp);
            tracedCallback({ path: req.path, query: req.query, body: req.body, requestID: id });
        });

        const port = state.getListenPort();

        this.app.listen(port);
        console.error(`Serverless function has started listening on port ${port}`);
    }


    public respond(response: any) {
        let [_, $response] = this.trace.popArgs();
        if(this.responseID === undefined) {
            throw Error ("oops");
        }
        let resp = this.response.get(this.responseID);
        this.response.delete(this.responseID);
        this.trace.tracePrimApp('send', [$response]);
        if(resp !== undefined) {
            if(typeof(response) === 'undefined') {
                resp.send('' + response);
            } else if(typeof(response) !== 'string' && response.length > 0) {
                resp.send('' + response);
            } else if(typeof(response) === 'object') {
                resp.set('X-Server-Hostname', hostname);
                resp.writeHead(200);
                resp.send('' + JSON.stringify(response, null, 4));
            } else {
                resp.send('' + response);
            }
        } else if(state.getListenPort() !== 'test') {
            throw new Error("No express.Response found. this.responseID: " + this.responseID);
        }
    }

    public hello() {
        let response = "Hello from JavaScript!";
        let $response = string("Hello from Rust!");
        let _ = this.trace.popArgs();
        if(this.responseID === undefined) {
            throw Error ("oops");
        }
        let resp = this.response.get(this.responseID);
        this.response.delete(this.responseID);
        this.trace.tracePrimApp('send', [$response]);
        if(resp !== undefined) {
            resp.set('X-Server-Hostname', hostname); 
            resp.send('' + response);
        } else if(state.getListenPort() !== 'test') {
            throw new Error("No express.Response found.");
        }
    }
}
