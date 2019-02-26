const $T = require('../dist/runtime');
import { Interpreter } from '../ts/interpreter';
import * as insertTracing from '../ts/insertTracing';
import { Exp, Obj } from "../ts/types";

let interp = new Interpreter();

export function run_test(code: string, input: (string | boolean | number)) {
  $T.clear();
  // NOTE(arjun): We could also run 'eval(code)(input)', but we are not. We
  // are assuming that the tracing does not change the semantics of 'code'.
  let trace = insertTracing.transform(code);
  //console.log(trace);
  let func_output = eval(trace)(input);
  //$T.log();
  let ast_output = interp.eval($T.program_(), wrap_exp(input));
  expect(ast_output).toEqual(wrap_exp(func_output));
}

function wrap_exp(v : (number | string | boolean)): Exp {
  switch (typeof v) {
    case 'string': return $T.str(v);
    case 'number': return $T.num(v);
    case 'boolean': return $T.bool(v);
    //case 'object': return wrap_object(v);
    default: throw "Found unexpected type in wrap_exp."
  }
}