/**
 * This module is a runtime system for generating execution traces. The entry
 * point of this module is the 'newTrace' function, which creates an empty
 * trace. That function returns object with several methods -- all prefixed
 * with the token 'trace' -- for incrementally building execution traces.
 *
 * A few things to note:
 *
 * - The 'traceIfTrue' and 'traceIfFalse' methods both trace an 'if' expression,
 *   and automatically enter the block for the true part and false part
 *   respectively.
 * - When control reaches the end of a block, the program must invoke the
 *   'exitBlock' method. The top-level of the program is also a block, therefore
 *   the program must invoke 'exitBlock' after tracing the last expression of
 *   the program.
 * - The 'traceCallback' method returns a new 'Trace' class to trace within the
 *   body of a callback function. The program must call 'exitBlock' at the end
 *   of a callback, since it is a block as well.
 */
export type BinOp = '+';

type BlockExp = { kind: 'block', body: Exp[] };

type LetExp = { kind: 'let', name: string, named: Exp };
type IfExp = { kind: 'if', cond: Exp, truePart: Exp[], falsePart: Exp[] };
type CallbackExp = { kind: 'callback', event: string, arg: string, body: Exp[] };

/**
 * NOTE(arjun): We do not make a distinction between statements and expressions.
 * However, we do use blocks instead of deeply nesting let expressions. We do
 * this for two reasons:
 *
 * 1. It simplifies the definition of contexts significantly, and
 * 2. very deeply nested let expressions can lead to stack overflow errors,
 *    e.g., during serialization. I am not certain that serde will suffer this
 *    problem, but it is a problem I've encountered with other serialization
 *    libraries.
 *
 * We rely on some invariants for blocks to make sense:
 * 1. An unknown can only appear as the last expression in a block.
 */
export type Exp
    =  { kind: 'unknown' }
    | { kind: 'number', value: number }
    | { kind: 'identifier', name: string }
    | { kind: 'binop', op: BinOp, e1: Exp, e2: Exp }
    | IfExp
    | LetExp
    | BlockExp
    | CallbackExp;

export function identifier(name: string): Exp {
    return { kind: 'identifier', name };
}

export function number(value: number): Exp {
    return { kind: 'number', value };
}

export function if_(cond: Exp, truePart: Exp[], falsePart: Exp[]): IfExp {
    return { kind: 'if', cond, truePart, falsePart };
}

export function callback(event: string, arg: string, body: Exp[]): CallbackExp {
    return { kind: 'callback', event, arg, body };
}

export function let_(name: string, named: Exp): LetExp {
    return { kind: 'let', name, named };
}

export function block(body: Exp[]): BlockExp {
    return { kind: 'block', body };
}

export function unknown(): Exp {
    return { kind: 'unknown' };
}


type Cursor = { body: Exp[], index: number };

class Trace {
    private trace: BlockExp;
    private cursorStack: Cursor[];
    private cursor: Cursor | undefined;

    constructor(body: Exp[]) {
        let exp = block(body);
        this.trace = exp;
        this.cursor = { body: exp.body, index: 0 };
        this.cursorStack = [];
    }

    private getValidCursor(): Cursor {
        if (this.cursor === undefined) {
            throw new Error('Trace is complete');
        }
        return this.cursor;
    }

    private getCurrentExp() {
        let cursor = this.getValidCursor();
        if (cursor.index === cursor.body.length) {
            throw new Error(`Attempting to trace after the end of a block
                (index is ${cursor.index})`);
        }
        return cursor.body[cursor.index];
    }

    private mayIncrementCursor() {
        let cursor = this.getValidCursor();
        if (cursor.index === cursor.body.length - 1 &&
            cursor.body[cursor.index].kind !== 'unknown') {
            // At the end of the block during a re-trace.
            return;
        }
        cursor.index = cursor.index + 1;
    }

    private setExp(exp: Exp) {
        let cursor = this.getValidCursor();
        let kind = cursor.body[cursor.index].kind;
        if (kind !== 'unknown') {
            throw new Error(`Cannot discard expression of kind ${kind}`);
        }
        // Assumes that we are at the end of the block
        cursor.body[cursor.index] = exp;
        cursor.body.push(unknown());
        cursor.index = cursor.index + 1;
    }

    private enterBlock(cursor: Cursor) {
        if (this.cursor !== undefined) {
            this.cursorStack.push(this.cursor);
        }
        this.cursor = cursor;
    }

    getTrace(): Exp {
        return this.trace;
    }

    newTrace() {
        this.cursor = { body: this.trace.body, index: 0 };
        this.cursorStack = [];
    }

    exitBlock() {
        if (this.cursor === undefined) {
            throw new Error(`called exitBlock on a complete trace`);
        }
        let cursor = this.cursor;
        if (cursor.index !== cursor.body.length - 1) {
            throw new Error('Exiting block too early');
        }
        if (this.cursor.body[cursor.index].kind === 'unknown') {
            this.cursor.body.pop();
        }
        this.cursor = this.cursorStack.pop();
    }

    traceLet(name: string, named: Exp): void {
        let exp = this.getCurrentExp();
        if (exp.kind === 'unknown') {
            this.setExp(let_(name, named));
        }
        else if (exp.kind === 'let') {
            if (exp.name !== name) {
                throw new Error(`Cannot merge let with name ${name} into let with
                    name ${exp.name}`);
            }
            exp.named = mergeExp(exp.named, named);
            this.mayIncrementCursor();
        }
        else {
            throw new Error(`expected let, got ${exp.kind}`);
        }
    }

    traceIfTrue(cond: Exp) {
        let exp = this.getCurrentExp();
        if (exp.kind === 'unknown') {
            let newBlock = [unknown()];
            this.setExp(if_(cond, newBlock, [unknown()]));
            this.enterBlock({ body: newBlock, index: 0 });
        }
        else if (exp.kind === 'if') {
            exp.cond = mergeExp(exp.cond, cond);
            this.mayIncrementCursor();
            this.enterBlock({ body: exp.truePart, index: 0 });
        }
        else {
            throw new Error(`expected if, got ${exp.kind}`);
        }
    }

    traceIfFalse(cond: Exp) {
        let exp = this.getCurrentExp();
        if (exp.kind === 'unknown') {
            let newBlock = [unknown()];
            this.setExp(if_(cond, [unknown()], newBlock));
            this.enterBlock({ body: newBlock, index: 0 });
        }
        else if (exp.kind === 'if') {
            exp.cond = mergeExp(exp.cond, cond);
            this.mayIncrementCursor();
            this.enterBlock({ body: exp.falsePart, index: 0 });
        }
        else {
            throw new Error(`expected if, got ${exp.kind}`);
        }
    }

    traceCallback(event: string, arg: string): Trace {
        let exp = this.getCurrentExp();
        if (exp.kind === 'unknown') {
            let callbackBody: Exp[] = [ unknown() ];
            this.setExp(callback(event, arg, callbackBody));
            return new Trace(callbackBody);
        }
        else if (exp.kind === 'callback') {
            if (exp.event !== event || exp.arg !== arg) {
                throw new Error(`called traceCallback(${event}, ${arg}), but
                   hole contains traceCallback(${exp.event}, ${exp.arg})`);
            }
            this.mayIncrementCursor();
            return new Trace(exp.body);
        }
        else {
            throw new Error(`hole contains ${exp.kind}`);
        }
    }

}

export function newTrace() {
    return new Trace([unknown()]);
}

function mergeExpArray(e1: Exp[], e2: Exp[]): Exp[] {
    // TODO(arjun): This may be wrong. What if one is [ unknown ] and the
    // other is [ 1 , 2 ]. Shouldn't the merge be [ 1, 2 ]?
    if (e1.length !== e2.length) {
        throw new Error('uneven lengths in block');
    }
    for (let i = 0; i < e1.length; i = i + 1) {
        e1[i] = mergeExp(e1[i], e2[i]);
    }
    return e1;

}

function mergeExp(e1: Exp, e2: Exp): Exp {
    if (e1.kind === 'unknown') {
        return e2;
    }
    else if (e2.kind === 'unknown') {
        return e1;
    }
    else if (e1.kind === 'number' && e2.kind === 'number') {
        if (e1.value !== e2.value) {
            throw new Error(`Cannot merge numbers ${e1.value} and ${e2.value}`);
        }
        return e1;
    }
    else if (e1.kind === 'identifier' && e2.kind === 'identifier') {
        if (e1.name !== e2.name) {
            throw new Error(`Cannot merge identifiers ${e1.name} and
                ${e2.name}`);
        }
        return e1;
    }
    else if (e1.kind === 'let' && e2.kind === 'let') {
        if (e1.name !== e2.name) {
            throw new Error(`Cannot merge let expressions naming ${e1.name}
                and ${e2.name}`);
        }
        e1.named = mergeExp(e1.named, e2.named);
        return e1;
    }
    else if (e1.kind === 'if' && e2.kind === 'if') {
        e1.cond = mergeExp(e1.cond, e2.cond);
        e1.truePart = mergeExpArray(e1.truePart, e2.truePart);
        e1.falsePart = mergeExpArray(e1.falsePart, e2.falsePart);
        return e1;
    }
    else if (e1.kind === 'binop' && e2.kind === 'binop') {
        if (e1.op !== e2.op) {
            throw new Error(`Cannot merge operations ${e1.op} and ${e2.op}`);
        }
        e1.e1 = mergeExp(e1.e1, e1.e2);
        e1.e2 = mergeExp(e1.e2, e2.e2);
        return e1;
    }
    else if (e1.kind === 'block' && e2.kind === 'block') {
        e1.body = mergeExpArray(e1.body, e2.body);
        return e1;
    }
    else {
        // Note: We do not support merging callbacks here. traceCallback takes
        // care of that.
        throw new Error(`Cannot merge expressions of kinds ${e1.kind} and
            ${e2.kind}`);
    }
}