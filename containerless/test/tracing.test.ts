import {
    block, let_, number, if_, newTrace, callback, identifier, string, binop, unknown
} from '../ts/tracing';
import { Callbacks } from '../ts/callbacks';

test('trivial trace', () => {
    let t = newTrace();
    t.traceLet('x', number(12));
    t.traceLet('y', number(120));
    t.exitBlock();
    expect(t.getTrace()).toMatchObject(
        block([
            let_('x', number(12)),
            let_('y', number(120))]));
});

test('trivial retrace', () => {
    let t = newTrace();
    t.traceLet('x', number(12));
    t.traceLet('y', number(120));
    t.exitBlock();
    t.newTrace();
    t.traceLet('x', number(12));
    t.traceLet('y', number(120));
    t.exitBlock();
    expect(t.getTrace()).toMatchObject(
        block([
            let_('x', number(12)),
            let_('y', number(120))]));
});

test('tracing both branches of a conditional', () => {
    let t = newTrace();
    t.traceIfTrue(number(0));
    t.traceLet('x', number(100));
    t.exitBlock();
    t.traceLet('z', number(300));
    t.exitBlock();

    t.newTrace();
    t.traceIfFalse(number(0));
    t.traceLet('y', number(200));
    t.exitBlock();
    t.traceLet('z', number(300));
    t.exitBlock();

    expect(t.getTrace()).toMatchObject(
        block([
            if_(number(0),
                [let_('x', number(100))],
                [let_('y', number(200))]),
            let_('z', number(300))]));
});

test('callback in trace', () => {
    let t = newTrace();
    t.traceLet('x', number(10));
    let innerTrace = t.traceCallback('dummy-event', identifier('x'));
    t.traceLet('y', number(20));
    t.exitBlock();

    // Now, the callback runs
    innerTrace.traceLet('z', number(30));
    innerTrace.exitBlock();

    expect(t.getTrace()).toMatchObject(
        block([
            let_('x', number(10)),
            callback('dummy-event', identifier('x'), [
                let_('z', number(30))]),
            let_('y', number(20))]));
});

test('tracing a function', () => {
    let t = newTrace();

    function F(x: any) {
        t.traceLet('x', t.popArg());
        t.traceLet('y', binop('+', identifier('x'), number(10)));
        let y = x + 10;
        t.traceReturn(identifier('y'));
        return y;
    }

    let a = 100;
    t.traceLet('a', number(100));
    t.pushArg(identifier('a'));
    t.traceNamed('w');
    let w = F(a);
    t.exitBlock();

    t.traceLet('z', number(200));
    t.pushArg(identifier('z'));
    t.traceNamed('v');
    let v = F(200);
    t.exitBlock();

    t.exitBlock();

    expect(t.getTrace()).toMatchObject(block([
        let_('a', number(100)),
        let_('w', block([
            let_('x', identifier('a')),
             let_('y', binop('+', identifier('x'), number(10))),
             identifier('y')
            ])),
        let_('z', number(200)),
        let_('v', block([
            let_('x', identifier('z')),
                let_('y', binop('+', identifier('x'), number(10))),
                identifier('y')
            ])),
        ]));
});

test('same fun, different control flow', () => {
    let t = newTrace();

    function F(x: any) {
        t.traceLet('x', t.popArg());
        let ret = 0;
        if(x > 10) {
            t.traceIfTrue(binop('>', identifier('x'), number(10)));
            t.traceLet('ret', number(42));
            ret = 42;
        } else {
            t.traceIfFalse(binop('>', identifier('x'), number(10)));
            t.traceLet('ret', number(24));
            ret = 24;
        }
        t.exitBlock();

        t.traceReturn(identifier("ret"));
    }

    let a = 11;
    t.traceLet('a', number(11));
    t.pushArg(identifier('a'));
    t.traceNamed('w');
    let w = F(a);
    t.exitBlock();

    let b = 9;
    t.traceLet('b', number(9));
    t.pushArg(identifier('b'));
    t.traceNamed('v');
    let v = F(b);
    t.exitBlock();

    t.exitBlock();

    expect(t.getTrace()).toMatchObject(block([
        let_('a', number(11)),
        let_('w', block([
             let_('x', identifier('a')),
             if_(binop('>', identifier('x'), number(10)),
                [let_('ret', number(42))],
                [unknown()]),
             identifier("ret")
            ])),
        let_('b', number(9)),
        let_('v', block([
             let_('x', identifier('b')),
             if_(binop('>', identifier('x'), number(10)),
                [unknown()],
                [let_('ret', number(24))]),
             identifier("ret")
            ])),
        ]));
});

test('exit fun from within if', () => {
    let t = newTrace();

    function F(x: any) {
        t.traceLet('x', t.popArg());
        let ret = 0;
        if(x > 10) {
            t.traceIfTrue(binop('>', identifier('x'), number(10)));
            t.traceReturn(number(42));
            t.exitBlock(); // t.exitBlock() exits the if, it follows the last t. statement within a block.
            return 42;
        } else {
            t.traceIfFalse(binop('>', identifier('x'), number(10)));
            t.traceReturn(number(24));
            t.exitBlock(); // t.exitBlock() exits the if, it follows the last t. statement within a block.
            return 24;
        }
    }

    let a = 11;
    t.traceLet('a', number(11));
    t.pushArg(identifier('a'));
    t.traceNamed('w');
    let w = F(a);
    t.exitBlock(); // t.exitBlock() exits the block created by t.traceNamed().

    let b = 9;
    t.traceLet('b', number(9));
    t.pushArg(identifier('b'));
    t.traceNamed('v');
    let v = F(b);
    t.exitBlock(); // t.exitBlock() exits the block created by t.traceNamed().

    t.exitBlock(); // t.exitBlock exits the program.

    t.pretty_print();

    expect(t.getTrace()).toMatchObject(block([
        let_('a', number(11)),
        let_('w', block([
             let_('x', identifier('a')),
             if_(binop('>', identifier('x'), number(10)),
                [number(42)],
                [unknown()])
            ])),
        let_('b', number(9)),
        let_('v', block([
             let_('x', identifier('b')),
             if_(binop('>', identifier('x'), number(10)),
                [unknown()],
                [number(24)])
            ])),
        ]));
});

test('tracing with callback library', (done) => {
    let cb = new Callbacks();
    cb.immediate('hello', (str) => {
        cb.trace.traceLet('x', number(100));
        // Why is this in here? If we put it after the last line
        // (cb.trace.exitBlock), we will get the trace before this callback
        // is called. If we don't wrap it in setImmediate, we will get it
        // when cb.trace refers to the inner trace.
        setImmediate(() => {
            expect(cb.trace.getTrace()).toMatchObject(
                block([
                    callback('immediate', string('hello'), [
                        let_('x', number(100))]),
                    let_('y', number(200))]));
            done();
        });
    });
    cb.trace.traceLet('y', number(200));
    cb.trace.exitBlock();

});