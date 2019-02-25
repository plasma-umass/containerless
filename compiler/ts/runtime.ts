import { Name, Id, Typ, Exp, Stmt } from "../ts/types";
import { DH_UNABLE_TO_CHECK_GENERATOR } from "constants";

let program : Stmt[] = [];
let stack: Stmt[][] = [];
let current = program;

let args_stack : Exp[][] = [];

let nextName : Name = 0;
export function bind(e: Exp): Id {
    let name = nextName++;
    let t = getTyp(e);
    current.push({ kind: 'let', name: name, e: e });
    return { kind: 'identifier', name: name, type: t };
}

export function update(id: Id, e: Exp): void {
    let t = getTyp(e);
    current.push({
      kind: 'assignment',
      id: id,
      e: e
    });
}

export function input(): Exp {
    return { kind: 'input' };
}

export function args(es: Exp[]) {
  args_stack.push(es);
}

export function params(): Id[] {
  if(args_stack.length > 0) {
    const es = args_stack[args_stack.length - 1];
    args_stack.pop();
    return es.map(bind);
  } else {
    throw new Error ("Found empty args_stack in params().");
  }
}

export function return_(value: Exp) {
  current.push({
    kind: 'return',
    value: value
  })
}

export function expectReturn(): Exp {
  if(current.length > 0) {
    const theReturn = current[current.length - 1];
    current.pop();
    if(theReturn.kind === 'return') {
      return theReturn.value;
    } else {
      throw new Error("Expected kind return for theReturn.kind.");
    }
  } else {
    throw new Error("Found empty current in expectReturn().")
  }
}

// If there is no else, initialize as empty block Exp.
export function if_(test: Exp) {
  current.push({
      kind: 'if',
      test: test,
      then: { kind: 'unknown' },
      else: { kind: 'block', body: []} });
}

export function ifElse(test: Exp) {
    current.push({
        kind: 'if',
        test: test,
        then: { kind: 'unknown' },
        else: { kind: 'unknown' } });
}

export function enterIf(condition: boolean) {
    let theIf = current[current.length - 1];
    if (theIf.kind !== 'if') {
        throw 'Total disaster';
    }
    stack.push(current);
    current = [];

    // TODO(arjun): Test condition
    if (condition) {
        theIf.then = { kind: 'block', body: current };
    }
    else {
        theIf.else = { kind: 'block', body: current };
    }
}

export function exitIf() {
    current = stack.pop()!;
}

function getTyp(e: Exp): Typ {
    if (e.kind === 'string') {
        return { kind: 'string' };
    }
    else if (e.kind === 'boolean') {
        return { kind: 'boolean' };
    }
    else if (e.kind === 'number') {
        return { kind: 'number' };
    }
    else if (e.kind === 'identifier') {
        return e.type;
    }
    else if (e.kind === 'unaryop') {
        if (unaryOpReturnType.has(e.op)) {
            return unaryOpReturnType.get(e.op)!;
        }
        else {
            throw 'unaryop not implemented';
        }
    }
    else if (e.kind === 'binop') {
        if (binOpReturnType.has(e.op)) {
            return binOpReturnType.get(e.op)!;
        }
        else {
            throw 'binary op not implemented';
        }
    }
    else if (e.kind === 'ternary') {
        const consequentType = getTyp(e.consequent);
        const alternateType = getTyp(e.alternate);
        if (consequentType.kind !== alternateType.kind) {
            throw new Error(`consequent and alternate have different types, ${consequentType.kind} and ${alternateType.kind}`); // TODO(Chris): for now
        } else {
            return consequentType;
        }
    }
    else if (e.kind === 'input') {
        return { kind: 'number' } // TODO(arjun): For now
    }
    else {
        throw 'Not implemented';
    }
}

const unaryOpReturnType = new Map<string, Typ>();
const binOpReturnType = new Map<string, Typ>();

function genericUnaryOp(opStr: string, inputType: Typ, returnType: Typ): (e: Exp) => Exp {
    unaryOpReturnType.set(opStr, returnType);
    return function(e: Exp): Exp {
        if (getTyp(e).kind === inputType.kind) {
            return { kind: 'unaryop', op: opStr, e };
        } else {
            throw 'Not implemented';
        }
    }
}

function genericBinOp(opStr: string, inputType: Typ, returnType: Typ): (e1: Exp, e2: Exp) => Exp {
    binOpReturnType.set(opStr, returnType);
    return function(e1: Exp, e2: Exp): Exp {
        if (getTyp(e1).kind === inputType.kind &&
            getTyp(e2).kind === inputType.kind) {
            return { kind: 'binop', op: opStr, e1, e2 };
        } else {
            throw 'Not implemented';
        }
    }
}

// TODO(Chris): Many of these operations were very haphazardly named, and the export names
// may need to change if we have separate exported functions like +num and +str, etc.
export const neg            = genericUnaryOp('unary-', { kind: 'number' } , { kind: 'number' });
export const plus           = genericUnaryOp('unary+', { kind: 'number' } , { kind: 'number' });
export const not            = genericUnaryOp('!',      { kind: 'boolean' }, { kind: 'boolean' });
export const bitnot         = genericUnaryOp('~',      { kind: 'number' } , { kind: 'number' });

export const eq             = genericBinOp('==num',  { kind: 'number' } , { kind: 'boolean' });
export const ineq           = genericBinOp('!=num',  { kind: 'number' } , { kind: 'boolean' });
export const exacteq        = genericBinOp('===num', { kind: 'number' } , { kind: 'boolean' });
export const exactineq      = genericBinOp('!==num', { kind: 'number' } , { kind: 'boolean' });
export const lt             = genericBinOp('<',      { kind: 'number' } , { kind: 'boolean' });
export const gt             = genericBinOp('>',      { kind: 'number' } , { kind: 'boolean' });
export const leq            = genericBinOp('<=',     { kind: 'number' } , { kind: 'boolean' });
export const geq            = genericBinOp('>=',     { kind: 'number' } , { kind: 'boolean' });
export const sub            = genericBinOp('-',      { kind: 'number' } , { kind: 'number' });
export const div            = genericBinOp('/',      { kind: 'number' } , { kind: 'number' });
export const mul            = genericBinOp('*',      { kind: 'number' } , { kind: 'number' });
export const remainder      = genericBinOp('%',      { kind: 'number' } , { kind: 'number' });
export const pow            = genericBinOp('**',     { kind: 'number' } , { kind: 'number' });
export const lshift         = genericBinOp('<<',     { kind: 'number' } , { kind: 'number' });
export const rshift         = genericBinOp('>>',     { kind: 'number' } , { kind: 'number' });
export const unsignedrshift = genericBinOp('>>>',    { kind: 'number' } , { kind: 'number' });
export const bitand         = genericBinOp('&',      { kind: 'number' } , { kind: 'number' });
export const bitor          = genericBinOp('|',      { kind: 'number' } , { kind: 'number' });
export const bitxor         = genericBinOp('^',      { kind: 'number' } , { kind: 'number' });
export const and            = genericBinOp('&&',     { kind: 'boolean' }, { kind: 'boolean' });
export const or             = genericBinOp('||',     { kind: 'boolean' }, { kind: 'boolean' });


binOpReturnType.set('+num', { kind: 'number' });
binOpReturnType.set('+str', { kind: 'string' });
export function add(e1: Exp, e2: Exp): Exp {
    if (getTyp(e1).kind === 'number' &&
        getTyp(e2).kind === 'number') {
        return { kind: 'binop', op: '+num', e1, e2 };
    } else if (getTyp(e1).kind === 'string' &&
               getTyp(e2).kind === 'string') {
        return { kind: 'binop', op: '+str', e1, e2 };
    } else {
        throw 'Not implemented';
    }
}

export function ternary(test: Exp, consequent: Exp, alternate: Exp): Exp {
    if (getTyp(test).kind === 'boolean') {
        return { kind: 'ternary', test, consequent, alternate };
    } else {
        throw new Error(`Ternary expression test is ${getTyp(test).kind}, not a boolean`);
    }
}

export function num(n: number): Exp {
    return { kind: 'number', value: n };
}

export function str(s: string): Exp {
    return { kind: 'string', value: s };
}

export function bool(b: boolean): Exp {
  return { kind: 'boolean', value: b };
}

export function log() {
    console.log(JSON.stringify(program, null, 2));
}

// TODO(emily): Used for testing, replace with something more elegant.
// i.e. https://github.com/plasma-umass/ElementaryJS/blob/master/ts/runtime.ts#L316
export function clear() {
  program = [];
  stack = [];
  current = program;
}

export function program_() {
  return program;
}
