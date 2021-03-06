import * as b from '@babel/types';
import { assertNormalized } from './assertNormalized';
import { Map } from 'immutable';
import * as parser from '@babel/parser';
import generator from '@babel/generator';
import * as n from '@stopify/normalize-js';

type State = Map<string, boolean>;

// NOTE(emily): This may not be righb. I have not yet hit a case where the error is triggered.
function merge(x: State, y: State): State {
    return x.mergeWith(
        (v1, v2) => {
            if(v1! !== v2!) {
                throw new Error("Mismatched kinds!");
            } else {
                return v1!;
            }
        },
        y
    )
}

const functionBreakName = '\'ret';

const t: b.MemberExpression = b.memberExpression(b.identifier('cb'), b.identifier('trace'));

const newTrace: b.ExpressionStatement =
    b.expressionStatement(
        b.callExpression(
            b.memberExpression(
                t,
                b.identifier('newTrace')
            ),
            []
        )
    );

function identifier(s: string): b.CallExpression {
    const callee = b.memberExpression(
        b.identifier('exp'),
        b.identifier('identifier')
    );
    const theArgs = [b.stringLiteral(s)];
    return b.callExpression(callee, theArgs);
}

function from(lhs: b.Expression, rhs: string): b.CallExpression {
    const callee = b.memberExpression(
        b.identifier('exp'),
        b.identifier('from')
    );
    const theArgs = [lhs, b.stringLiteral(rhs)];
    return b.callExpression(callee, theArgs);
}

function get(lhs: b.Expression, rhs: string): b.CallExpression {
    const callee = b.memberExpression(
        b.identifier('exp'),
        b.identifier('get')
    );
    const theArgs = [lhs, b.stringLiteral(rhs)];
    return b.callExpression(callee, theArgs);
}

// TODO(emily): Think about let x = 0; arr[x]; case.
function index(lhs: b.Expression, rhs: b.Expression): b.CallExpression {
    const callee = b.memberExpression(
        b.identifier('exp'),
        b.identifier('index')
    );
    const theArgs = [lhs, rhs];
    return b.callExpression(callee, theArgs);
}

function number(n: number): b.CallExpression {
    const callee = b.memberExpression(
        b.identifier('exp'),
        b.identifier('number')
    );
    const theArgs = [b.numericLiteral(n)];
    return b.callExpression(callee, theArgs);
}

function boolean(bool: boolean): b.CallExpression {
    const callee = b.memberExpression(
        b.identifier('exp'),
        b.identifier('boolean')
    );
    const theArgs = [b.booleanLiteral(bool)];
    return b.callExpression(callee, theArgs);
}

function string(s: string): b.CallExpression {
    const callee = b.memberExpression(
        b.identifier('exp'),
        b.identifier('string')
    );
    const theArgs = [b.stringLiteral(s)];
    return b.callExpression(callee, theArgs);
}

function obj(props: b.ObjectProperty[]): b.CallExpression {
    const callee = b.memberExpression(
        b.identifier('exp'),
        b.identifier('obj')
    );
    const theArgs = [b.objectExpression(props)];
    return b.callExpression(callee, theArgs);
}

function clos(props: b.ObjectProperty[]): b.CallExpression {
    const callee = b.memberExpression(
        b.identifier('exp'),
        b.identifier('clos')
    );
    const theArgs = [b.objectExpression(props)];
    return b.callExpression(callee, theArgs);
}

function array(exps: b.Expression[]): b.CallExpression {
    const callee = b.memberExpression(
        b.identifier('exp'),
        b.identifier('array')
    );
    const theArgs = [b.arrayExpression(exps)];
    return b.callExpression(callee, theArgs);
}

const undefined_: b.MemberExpression =
    b.memberExpression(
        b.identifier('exp'),
        b.identifier('undefined_')
    );

function binop(op: string, e1: b.Expression, e2: b.Expression): b.CallExpression {
    const callee = b.memberExpression(
        b.identifier('exp'),
        b.identifier('binop')
    );
    const theArgs = [b.stringLiteral(op), e1, e2];
    return b.callExpression(callee, theArgs);
}

function methodCall(exp: b.Expression, method: string, methodCallArgs: b.Expression[]): b.CallExpression {
    const callee = b.memberExpression(
        b.identifier('exp'),
        b.identifier('methodCall')
    );
    const theArgs = [exp, b.stringLiteral(method), b.arrayExpression(methodCallArgs)];
    return b.callExpression(callee, theArgs);
}

function op1(op: string, e: b.Expression): b.Expression {
    const callee = b.memberExpression(
        b.identifier('exp'),
        b.identifier('op1')
    );
    return b.callExpression(callee, [b.stringLiteral(op), e]);
}

function traceLet(lhs: string, rhs: b.Expression): b.ExpressionStatement {
    const memberExpression = b.memberExpression(t, b.identifier('traceLet'));
    const callExpression = b.callExpression(memberExpression, [b.stringLiteral(lhs), rhs]);
    return b.expressionStatement(callExpression);
}

/**
 * ```
 * let [$clos] = b.traceFunctionBody('$return');
 * ```
 */
function jsLet(lhs: b.LVal, rhs: b.Expression): b.VariableDeclaration {
    const variableDeclarator = b.variableDeclarator(lhs, rhs);
    return b.variableDeclaration('let', [variableDeclarator]);
}

function jsAssignment(lhs: b.LVal, rhs: b.Expression): b.ExpressionStatement {
    const assignmentExpression = b.assignmentExpression('=', lhs, rhs);
    return b.expressionStatement(assignmentExpression);
}

function traceSet(lhs: b.Expression, rhs: b.Expression): b.CallExpression {
    const memberExpression = b.memberExpression(t, b.identifier('traceSet'));
    return b.callExpression(memberExpression, [lhs, rhs]);
}

function traceWhile(test: b.Expression): b.ExpressionStatement {
    const memberExpression = b.memberExpression(t, b.identifier('traceWhile'));
    const callExpression = b.callExpression(memberExpression, [test]);
    return b.expressionStatement(callExpression);
}

const traceLoop: b.ExpressionStatement =
    b.expressionStatement(
        b.callExpression(
            b.memberExpression(
                t,
                b.identifier('traceLoop')
            ),
            []
        )
    );

function traceIfTrue(id: string): b.ExpressionStatement {
    const memberExpression = b.memberExpression(t, b.identifier('traceIfTrue'));
    const callExpression = b.callExpression(memberExpression, [b.identifier(id)]);
    return b.expressionStatement(callExpression);
}

function traceIfFalse(id: string): b.ExpressionStatement {
    const memberExpression = b.memberExpression(t, b.identifier('traceIfFalse'));
    const callExpression = b.callExpression(memberExpression, [b.identifier(id)]);
    return b.expressionStatement(callExpression);
}

// TODO(emily): Change this to LVal later.
function traceFunctionCall(id: string, theArgs: b.Expression[]): b.ExpressionStatement {
    const memberExpression = b.memberExpression(t, b.identifier('traceFunctionCall'));
    const memberArgs = [b.stringLiteral(id), b.arrayExpression(theArgs)];
    const callExpression = b.callExpression(memberExpression, memberArgs);
    return b.expressionStatement(callExpression);
}

function traceFunctionBody(): b.Expression {
    const memberExpression = b.memberExpression(t, b.identifier('traceFunctionBody'));
    return b.callExpression(memberExpression, [b.stringLiteral(functionBreakName)]);
}

function traceLabel(name: string): b.ExpressionStatement {
    const memberExpression = b.memberExpression(t, b.identifier('traceLabel'));
    const callExpression = b.callExpression(memberExpression, [b.stringLiteral(name)]);
    return b.expressionStatement(callExpression);
}

function traceBreak(name: string, value : b.Expression = undefined_): b.ExpressionStatement {
    const memberExpression = b.memberExpression(t, b.identifier('traceBreak'));
    const callExpression = b.callExpression(memberExpression, [b.stringLiteral(name), value]);
    return b.expressionStatement(callExpression);
}

function tracePrimApp(event: string, eventArgs: b.Expression[]): b.ExpressionStatement {
    const memberExpression = b.memberExpression(t, b.identifier('tracePrimApp'));
    const memberArgs = [b.stringLiteral(event), b.arrayExpression(eventArgs)];
    const callExpression = b.callExpression(memberExpression, memberArgs);
    return b.expressionStatement(callExpression);
}

const exitBlock: b.ExpressionStatement =
    b.expressionStatement(
        b.callExpression(
            b.memberExpression(
                t,
                b.identifier('exitBlock')
            ),
            []
        )
    );

/**
 * ```
 * x
 * ```
 *
 * ```
 * identifier(x)
 * ```
 *
 * ```
 * number(1)
 * ```
 *
 * ```
 * boolean(true)
 * ```
 *
 * ```
 * binop('+', number(1), number(2))
 * ```
 * ---
 *
 * ```
 * foo = 12;
 * ```
 *
 * ```
 * b.traceSet('foo', number(12));
 * foo = 12;
 * ```
 */
function transformExpression(e: b.Expression, st: State): [b.Expression, State] {
    switch(e.type) {
        case 'Identifier': {
            if(e.name === 'undefined') {
                return [undefined_, st];
            } else if(st.has(e.name)) {
                if(st.get(e.name)) {
                    return [from(b.identifier('$clos'), e.name), st];
                } else {
                    return [identifier(e.name), st];
                }
            } else {
                return [from(b.identifier('$clos'), e.name), st.set(e.name, true)];
            }
        }
        case 'NumericLiteral': return [number(e.value), st];
        case 'BooleanLiteral': return [boolean(e.value), st];
        case 'StringLiteral': return [string(e.value), st];
        case 'BinaryExpression': {
            const [left, st1] = transformExpression(e.left, st);
            const [right, st2] = transformExpression(e.right, st);
            return [binop(e.operator, left, right), merge(st1, st2)];
        }
        case 'AssignmentExpression': {
            const e2 = assertNormalized(e);
            const [right, st1] = transformExpression(e2.right, st);
            const [left, st2] = transformExpression(e2.left, st);
            return [traceSet(left, right), merge(st1, st2)];
        }
        case 'MemberExpression': {
            const obj = e.object;
            const [lhs, st2] = transformExpression(obj, st);
            const prop = e.property;

            if((b.isIdentifier(obj) || b.isMemberExpression(obj)) && b.isIdentifier(prop) && e.computed == false) {
                return [get(lhs, prop.name), st2];
            } else {
                const [rhs, st3] = transformExpression(prop, st);
                return [index(lhs, rhs), merge(st2, st3)];
            }
        }
        case 'ObjectExpression': {
            const e2 = assertNormalized(e);
            const properties = e2.properties;
            let props: b.ObjectProperty[] = [];
            let str = st;
            properties.forEach(p => {
                if(!b.isObjectProperty(p) || !(b.isIdentifier(p.key) || b.isStringLiteral(p.key)) || b.isRestElement(p.value)) {
                    throw new Error("Found something unexpected.");
                } else {
                    let [rhs, st1] = transformExpression(p.value, st);
                    str = merge(str, st1);
                    props.push(b.objectProperty(p.key, rhs));
                }
            })
            return [obj(props), str];
        }
        case 'ArrayExpression': {
            const elems = e.elements;
            let elems2: b.Expression[] = [];
            let st2 = st;
            elems.forEach(e => {
                if(e == null || b.isNullLiteral(e) || b.isSpreadElement(e)) {
                    throw new Error("Found unexpected array element.");
                }
                let [e2, st3] = transformExpression(e, st);
                elems2.push(e2);
                st2 = st2.merge(st3);
            });
            return [array(elems2), st2];
        }
        case 'LogicalExpression': {
            const [left, st1] = transformExpression(e.left, st);
            const [right, st2] = transformExpression(e.right, st);
            return [binop(e.operator, left, right), merge(st1, st2)];
        }
        case 'UnaryExpression': {
            let [e1, st1] = transformExpression(e.argument, st);
            return [op1(e.operator, e1), st1];
        }
        default: {
            throw new Error('TODO: ' + e.type);
        }
    }
}

/**
 *
 * ```
 * b.traceLet('foo', number(1));
 * let foo = 1;
 * ```
 *
 * ```
 * b.traceFunctionCall('foo', [identifier('F'), number(1)]);
 * let foo = F(1);
 * b.exitBlock();
 * ```
 *
 * ```
 * b.traceLet('a', number(1));
 * let a = 1;
 * b.traceLet('F', clos({ a: identifier('a') }));
 * function F(x) { // let F = function(x) {
 *  let [$clos, $x] = b.traceFunctionBody('$return');
 *  b.traceLet('x', $x);
 *  b.traceBreak('$return', binop('+', from($clos, 'a'), identifier('x')));
 *  return a + x; *
 *  b.exitBlock();
 * }
 * ```
 */
function transformVariableDeclaration(s: b.VariableDeclaration, st: State): [b.Statement[], State] {
    let s1 = assertNormalized(s);
    const name = lvaltoName(s1.declarations[0].id);
    const init = s1.declarations[0].init;
    if(init === null) {
        const tLet = traceLet(name, undefined_);
        return [[s1, tLet], st.set(name, false)];
    }
    switch(init.type) {
        case 'CallExpression': {
            let init1 = assertNormalized(init);
            let theArgs: b.Expression[] = [];
            let nextSt = st;
            init1.arguments.forEach(a => {
                const [a1, st1] = transformExpression(a, st);
                theArgs.push(a1);
                nextSt = merge(st1, nextSt);
            });

            // NOTE: Push special case functions here.
            if(b.isIdentifier(init1.callee)) {
                switch(init1.callee.name) {
                    case 'require': {
                        return [[ s ], nextSt];
                    }
                    default: {
                        const [callE, st2] = transformExpression(init1.callee, nextSt);
                        nextSt = merge(nextSt, st2);
                        theArgs.unshift(callE);
                        break;
                    }
                }
            } else {
                const obj = init1.callee.object;
                const prop = init1.callee.property;
                if(!b.isIdentifier(obj) || !b.isIdentifier(prop)) {
                    throw new Error("Cannot chain member expressions!");
                }
                switch(obj.name) {
                    case 'console': {
                        const tPrimApp = tracePrimApp('console.log', theArgs);
                        return [[ tPrimApp, s ], nextSt];
                    }
                    default: {
                        break;
                    }
                }
                switch(prop.name) {
                    // TODO(arjun): Total hack. Do better.
                    case 'startsWith':
                    case 'shift':
                    case 'unshift':
                    case 'pop':
                    case 'push': {
                        const [obj2, st2] = transformExpression(obj, nextSt);
                        const tMethod = methodCall(obj2, prop.name, theArgs);
                        const tLet = traceLet(name, tMethod);
                        return [[ tLet, s ], st2.set(name, false)];
                        break;
                    }
                    default: {
                        break;
                    }
                }
                theArgs.unshift(from(identifier(obj.name), prop.name));
            }

            const tCall = traceFunctionCall(name, theArgs);
            return [[tCall, s, exitBlock], nextSt.set(name, false)];
        }
        case 'FunctionExpression': {
            const newFun = b.functionDeclaration(b.identifier(name), init.params, init.body);
            return transformFunctionDeclaration(newFun, st);
        }
        default: {
            const [init2, st1] = transformExpression(init, st);
            const tLet = traceLet(name, init2);
            return [[tLet, s], st1.set(name, false)];
        }
    }
}

/**
 * ```
 * b.traceWhile(identifier('c'));
 * while(c) {
 *  b.traceLoop();
 *  ...
 * }
 * b.exitBlock();
 * ```
 */
function transformWhileStatement(s: b.WhileStatement, st: State): [b.Statement[], State] {
    const [test, st1] = transformExpression(s.test, st);
    let [body, st2] = transformStatement(s.body, st);
    body.unshift(traceLoop);
    const tWhile = traceWhile(test);
    const theWhile = b.whileStatement(s.test, b.blockStatement(body));
    return [[tWhile, theWhile, exitBlock], merge(st1, st2)];
}

/**
 *
 * ```
 * let $test = identifier(c);
 * if(c) {
 *  b.traceIfTrue($test);
 *  ...
 * } else {
 *  b.traceIfFalse($test);
 * }
 * b.exitBlock();
 * ```
 *
 */
function transformIfStatement(s: b.IfStatement, st: State): [b.Statement[], State] {
    const [test, st1] = transformExpression(s.test, st);
    let [ifTrue, st2] = transformStatement(s.consequent, st);
    let [ifFalse, st3]: [b.Statement[], State] = [[], st];
    if(s.alternate !== null) {
        [ifFalse, st3] = transformStatement(s.alternate, st);
    }
    const id = '$test';
    ifTrue.unshift(traceIfTrue(id));
    ifFalse.unshift(traceIfFalse(id));
    const tTest = jsAssignment(b.identifier(id), test);
    const theIf = b.ifStatement(s.test, b.blockStatement(ifTrue), b.blockStatement(ifFalse));
    return [[tTest, theIf, exitBlock], merge(merge(st1, st2), st3)];
}

/*

Note: Turns `x++` into `t.traceSet(x, x - 1); x = x - 1;`

*/
function transformExpressionStatement(s: b.ExpressionStatement, st: State): [b.Statement[], State] {
    switch (s.expression.type) {
        case 'UpdateExpression': {
            let e = s.expression;
            if(!b.isIdentifier(e.argument)) {
                throw new Error("Expected argument!");
            } else if(e.operator !== '++') {
                throw new Error("Found unimplemented case.");
            }
            const [id, st1] = transformExpression(e.argument, st);
            let ts = b.expressionStatement(traceSet(id, binop('+', id, number(1))));
            let js = jsAssignment(e.argument, b.binaryExpression('+', e.argument, b.numericLiteral(1)));
            return [[ts, js], st1];
        }
        default: {
            const [expression, st1] = transformExpression(s.expression, st);
            const above = b.expressionStatement(expression);
            return [[above, s], st1];
        }
    }
}

/**
 *
 * ```
 * b.traceLabel('l');
 * l: {
 *  ...
 *  b.traceBreak('l');
 *  break l;
 *  b.exitBlock();
 * }
 * ```
 */
function transformLabeledStatement(s: b.LabeledStatement, st: State): [b.Statement[], State] {
    const name = s.label;
    let [body, st1] = transformStatement(s.body, st);
    body.push(exitBlock);
    const tLabel = traceLabel(lvaltoName(name));
    const theLabel = b.labeledStatement(name, b.blockStatement(body));
    return [[tLabel, theLabel], st1];
}

/**
 * ```
 * b.traceBreak('l');
 * break l;
 * ```
 */
function transformBreakStatement(s: b.BreakStatement, st: State): [b.Statement[], State] {
    const name = s.label;
    if(name === null) {
        throw new Error("Found null label in break.");
    } else {
        const tBreak = traceBreak(lvaltoName(name));
        return [[tBreak, s], st];
        // TODO(emily): wrong ?
    }
}

/**
 *
 * ```
 * b.traceLet('a', number(1));
 * let a = 1;
 * b.traceLet('F', clos({ a: identifier('a') }));
 * function F(x) {
 *  let [$clos, $x] = b.traceFunctionBody('$return');
 *  b.traceLet('x', $x);
 *  b.traceBreak('$return', binop('+', from($clos, 'a'), identifier('x')));
 *  return a + x; *
 *  b.exitBlock();
 * }
 * ```
 */
function transformFunctionDeclaration(s: b.FunctionDeclaration, st: State): [b.Statement[], State] {
    const id = s.id;
    if(id === null) {
        throw new Error("Null id!!");
    }
    const params = s.params;
    let funBodyLHS = [b.identifier('$clos')];
    let paramsBody: b.Statement[] = [];
    let nextSt: State = Map();
    for(let i=0; i<params.length; i++) {
        const p = params[i];
        if(!b.isIdentifier(p)) {
            throw new Error("Expected identitifier!");
        } else {
            const oldName = lvaltoName(p);
            const newName = b.identifier('$' + oldName);
            funBodyLHS.push(newName);
            paramsBody.push(traceLet(oldName, newName));
            nextSt = nextSt.set(oldName, false);
        }
    }
    let [body, myState] = transformStatement(s.body, nextSt);
    body = paramsBody.concat(body);
    body.unshift(jsLet(b.arrayPattern(funBodyLHS), traceFunctionBody()));
    body.push(exitBlock); // exit the label
    let retSt = st.set(lvaltoName(id), false);
    let fvs: b.ObjectProperty[] = [];
    myState.filter(v => v!)
        .keySeq().forEach(k => {
            if(retSt.has(k!)) {
                if(retSt.get(k!)!) {
                    // The one above me made this variable.
                    fvs.push(b.objectProperty(b.identifier(k!), from(b.identifier('$clos'), k!)));
                } else {
                    // I made this variable.
                    fvs.push(b.objectProperty(b.identifier(k!), identifier(k!)));
                }
            } else {
                // Someone above me made this variable.
                retSt = retSt.set(k!, true);
                fvs.push(b.objectProperty(b.identifier(k!), from(b.identifier('$clos'), k!)));
            }
        });
    const tClos = traceLet(lvaltoName(id), clos(fvs));
    const theFunction = b.functionDeclaration(id, params, b.blockStatement(body));
    return [[tClos, theFunction], retSt];
}

/**
 * ```
 * b.traceBreak('$return', number(42));
 * return 42;
 * ```
 */
function transformReturnStatement(s_: b.ReturnStatement, st: State): [b.Statement[], State] {
    let s = assertNormalized(s_);
    const [argument, st1] = transformExpression(s.argument, st);
    const tBreak = traceBreak(functionBreakName, argument);
    return [[tBreak, s], st1];
}

function transformStatement(s: b.Statement, st: State): [b.Statement[], State] {
    switch(s.type) {
        case 'VariableDeclaration': return transformVariableDeclaration(s, st);
        case 'WhileStatement': return transformWhileStatement(s, st);
        case 'BlockStatement': return transformStatements(s.body, st); // NOTE: this unwraps block statements.
        case 'IfStatement': return transformIfStatement(s, st);
        case 'ExpressionStatement': return transformExpressionStatement(s, st);
        case 'LabeledStatement': return transformLabeledStatement(s, st);
        case 'BreakStatement': return transformBreakStatement(s, st);
        case 'FunctionDeclaration': return transformFunctionDeclaration(s, st);
        case 'ReturnStatement': return transformReturnStatement(s, st);
        default: {
            throw new Error('TODO: ' + s.type);
        }
    }
}

function transformStatements(s: b.Statement[], st: State): [b.Statement[], State] {
    let ret: b.Statement[] = [];
    let nextSt = st;

    for(let i=0; i<s.length; i++) {
        let [r, st1] = transformStatement(s[i], nextSt);
        for(let j=0; j<r.length; j++) {
            ret.push(r[j]);
        }
        nextSt = merge(nextSt, st1);
    }

    return [ret, nextSt];
}

function transformBody(s: b.Statement[]): b.Statement[] {
    const [prog, _] = transformStatements(s, Map());
    // TODO(emily): Fix. Need to detect require statements or something.

    let req = prog.shift();

    if(req === undefined) {
        throw new Error("Undefined program.");
    }

    let head: b.Statement[] = [
        jsLet(b.identifier('cb'), b.memberExpression(b.identifier('containerless00'), b.identifier('cb'))),
        jsLet(b.identifier('exp'), b.memberExpression(b.identifier('containerless00'), b.identifier('exp'))),
        newTrace,
        jsLet(b.identifier('$test'), boolean(false))
    ];

    let tail: b.Statement[] = [
        exitBlock
    ];

    return [req, ...head, ...prog, ...tail];
}

/*
export function testTransform(inputCode: string): any {
    //let normalized = n.normalize(inputCode);
    let ast = parser.parse(inputCode);

    ast.program.body = transform(ast.program.body);
    ast.program.body.push(getTrace);
    return generator(ast.program).code;
}
*/

/**
 * Given an 'LVal' that is an identifier, produces the identifier's name.
 * Throws an exception if the 'LVal' is not an identifier.
 *
 * @param lval an l-value
 * @returns the name of the identifier, if 'lval' is an identifier
 */
function lvaltoName(lval: b.LVal): string {
    if (b.isIdentifier(lval)) {
        return lval.name;
    } else if (lval.type === 'RestElement' && lval.argument.type === 'Identifier') {
        return lval.argument.name;
    } else {
        throw new Error(`Expected Identifier, received ${lval.type}`);
    }
}



/*

    Variables conditions:

    1. If free, use `from($clos, 'foo')`
    2. Else, use `identifier('foo')`

*/

export function transform(inputCode: string): string {
    let normalized = n.normalize(inputCode);
    let ast = parser.parse(normalized);
    ast.program.body = transformBody(ast.program.body);
    return generator(ast.program).code;
}
