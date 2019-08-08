// These type definitions must be consistent with the definitions in TypeScript,
// which are found in /containerless/ts/exp.ts.
//
// We are using serde_json to automatically derive deserialization code. The
// following pages of documentation are relevant:
//
// - https://serde.rs/enum-representations.html
//
//   Illustrates the #[serde(tag = "kind")] directive.
//
// - https://serde.rs/attr-rename.html
//
//   Illustrates the #[serde(rename_all = "camelCase")] directive. Note that
//   the directive also renames type-tags. E.g., Exp::Undefined {} serializes
//   to { type: "undefined" } and not { type: "Undefined" }. The example does
//   not make this clear, but it is what we want.
//
// - I could not find documentation for the #[serde(rename = "+")] directive.
//   Instead, I guessed that it existed and it worked!
use serde::Deserialize;
use std::collections::HashMap;

use crate::verif::{
    transformer::Transformer
};

#[derive(PartialEq, Debug, Deserialize, Clone)]
pub enum Op2 {
    #[serde(rename = "+")]
    Add,
    #[serde(rename = "-")]
    Sub,
    #[serde(rename = ">")]
    GT,
    #[serde(rename = "===")]
    StrictEq
}

#[derive(PartialEq, Debug, Deserialize, Clone)]
pub enum Typ {
    I32,
    F64,
    Bool,
    String,
    Unknown,
    Undefined,
    Metavar(usize),
    Ref(Box<Typ>),
    Union(Box<Typ>, Box<Typ>)
}

impl Typ {

    pub fn has_metavars(&self) -> bool {
        match self {
            Typ::Metavar(_) => true,
            Typ::Ref(t) => t.has_metavars(),
            Typ::Union(t1, t2) => t1.has_metavars() || t2.has_metavars(),
            Typ::I32 => false,
            Typ::F64 => false,
            Typ::Bool => false,
            Typ::String => false,
            Typ::Unknown => false,
            Typ::Undefined => false
        }
    }

    pub fn occurs_in(&self, x: usize) -> bool {
        match self {
            Typ::Metavar(y) => x == *y,
            Typ::Ref(t) => t.occurs_in(x),
            Typ::Union(t1, t2) => t1.occurs_in(x) || t2.occurs_in(x),
            Typ::I32 => false,
            Typ::F64 => false,
            Typ::Bool => false,
            Typ::String => false,
            Typ::Unknown => false,
            Typ::Undefined => false
        }
    }

    pub fn apply_subst(&mut self,
        subst: &std::collections::HashMap<usize, Typ>) -> () {
        match self {
            Typ::Metavar(x) => match subst.get(x) {
                None => (),
                Some(t) => *self = t.clone()
            },
            Typ::Ref(t) => t.apply_subst(subst),
            Typ::Union(t1, t2) => {
                t1.apply_subst(subst);
                t2.apply_subst(subst)
            },
            Typ::I32 => (),
            Typ::F64 => (),
            Typ::Bool => (),
            Typ::String => (),
            Typ::Unknown => (),
            Typ::Undefined => ()
        }
    }


}

#[derive(PartialEq, Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Exp {
    Unknown { },
    Integer { value: i32 },
    Number { value: f64 },
    Identifier { name: String },
    From { exp: Box<Exp>, field: String },
    #[serde(rename = "string")]
    Stringg { value: String },
    Undefined {},
    #[serde(rename = "binop")]
    BinOp { op: Op2, e1: Box<Exp>, e2: Box<Exp> },
    If {
        cond: Box<Exp>,
        #[serde(rename = "truePart")] true_part: Vec<Exp>,
        #[serde(rename = "falsePart")] false_part: Vec<Exp>
    },
    While { cond: Box<Exp>, body: Box<Exp> },
    Let {
        name: String,
        #[serde(default)]
        typ: Option<Typ>,
        named: Box<Exp>
    },
    Set { name: LVal, named: Box<Exp> },
    Block { body: Vec<Exp> },
    Callback {
        event: String,
        #[serde(rename = "eventArg")] event_arg: Box<Exp>,
        #[serde(rename = "callbackArgs")] callback_args: Vec<String>,
        #[serde(rename = "clos")] callback_clos: Box<Exp>,
        body: Vec<Exp>
    },
    #[serde(skip)]
    Loopback {
        event: String,
        event_arg: Box<Exp>,
        callback_clos: Box<Exp>,
        id: i32
    },
    Label { name: String, body: Vec<Exp> },
    Break { name: String, value: Box<Exp> },
    Clos { tenv: HashMap<String,Exp> },
    Array { exps: Vec<Exp> },
    Index { e1: Box<Exp>, e2: Box<Exp> },
    #[serde(skip)]
    Ref { e: Box<Exp> },
    #[serde(skip)]
    Deref { e: Box<Exp> },
    #[serde(skip)]
    SetRef { e1: Box<Exp>, e2: Box<Exp> },
    PrimApp {
        event: String,
        #[serde(rename = "eventArgs")] event_args: Vec<Exp>
    }
}

pub mod constructors {

    // NOTE(arjun): I wish we could use this macro to avoid writing all these
    // constructors:
    //
    // https://docs.rs/derive-new/0.5.7/derive_new/
    //
    // But, I really don't want the new prefix on all names, and I want the
    // constructors to take care of allocating strings and boxes.

    use super::Exp::*;
    use super::Typ;
    use super::{Exp, Op2, LVal};

    use std::collections::HashMap;

    pub fn t_union(t1: Typ, t2: Typ) -> Typ {
        Typ::Union(Box::new(t1), Box::new(t2))
    }

    pub fn t_ref(t: Typ) -> Typ {
        Typ::Ref(Box::new(t))
    }

    pub fn unknown() -> Exp {
        return Unknown { };
    }

    pub fn integer(value: i32) -> Exp {
        return Integer { value: value };
    }

    pub fn number(value: f64) -> Exp {
        return Number { value };
    }

    pub fn id(name: &str) -> Exp {
        return Identifier { name: name.to_string() };
    }

    pub fn from(exp: Exp, field: &str) -> Exp {
        return From { exp: Box::new(exp), field: field.to_string() };
    }

    pub fn string(value: &str) -> Exp {
        return Stringg { value: value.to_string() };
    }

    pub fn undefined() -> Exp {
        return Undefined { };
    }

    pub fn binop(op: &Op2, e1: Exp, e2: Exp) -> Exp {
        return BinOp { op: op.clone(), e1: Box::new(e1), e2: Box::new(e2) }
    }

    pub fn if_(cond: Exp, true_part: Vec<Exp>, false_part: Vec<Exp>) -> Exp {
        return If { cond: Box::new(cond), true_part, false_part };
    }

    pub fn while_(cond: Exp, body: Exp) -> Exp {
        return While { cond: Box::new(cond), body: Box::new(body) };
    }

    pub fn let_(name: &str, named: Exp) -> Exp {
        return Let { name: name.to_string(), typ: None, named: Box::new(named) };
    }

    pub fn set(name: LVal, named: Exp) -> Exp {
        return Set { name: name, named: Box::new(named) };
    }

    pub fn ref_(e: Exp) -> Exp {
        Ref { e: Box::new(e) }
    }

    pub fn deref(e: Exp) -> Exp {
        Deref { e: Box::new(e) }
    }

    pub fn setref(e1: Exp, e2: Exp) -> Exp {
        SetRef { e1: Box::new(e1), e2: Box::new(e2) }
    }

    // NOTE(emily): Apparently its bad Rust to receive a Vec<T>
    // NOTE(arjun): What is the alternative?
    pub fn block(body: Vec<Exp>) -> Exp {
        return Block { body: body };
    }

    pub fn callback(event: &str, event_arg: Exp, callback_args: Vec<String>, callback_clos: Exp, body: Vec<Exp>) -> Exp {
        return Callback {
            event: event.to_string(),
            event_arg: Box::new(event_arg),
            callback_args: callback_args,
            callback_clos: Box::new(callback_clos),
            body: body
        };
    }

    pub fn loopback(event: &str, event_arg: Exp, callback_clos: Exp, id: i32) -> Exp {
        return Loopback { event: event.to_string(),
            callback_clos: Box::new(callback_clos),
            event_arg: Box::new(event_arg), id: id };
    }

    pub fn label(name: &str, body: Vec<Exp>) -> Exp {
        return Label { name: name.to_string(), body: body };
    }

    pub fn break_(name: &str, value: Exp) -> Exp {
        return Break { name: name.to_string(), value: Box::new(value) };
    }

    pub fn array(exps: Vec<Exp>) -> Exp {
        return Array { exps: exps };
    }

    pub fn index(e1: Exp, e2: Exp) -> Exp {
        return Index { e1: Box::new(e1), e2: Box::new(e2) };
    }

    pub fn prim_app(event: &str, event_args: Vec<Exp>) -> Exp {
        return PrimApp { event: event.to_string(), event_args: event_args };
    }

    pub fn clos(tenv: HashMap<String, Exp>) -> Exp {
        return Clos { tenv: tenv };
    }

}

#[derive(PartialEq, Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LVal {
    Identifier { name: String },
    From { exp: Box<Exp>, field: String },
    //Tuple { elems: Vec<String> }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::constructors::*;
    use std::fs::File;
    use std::io::prelude::*;
    use std::process::Stdio;
    use std::process::Command;
    use std::fs;

    fn test_harness(filename: &str, code: &str, requests: &str) -> Exp {
        let f = File::create(filename).expect("creating file");
        let mut js_transform = Command::new("node")
            .arg("../js-transform")
            .stdin(Stdio::piped())
            .stdout(f)
            .spawn()
            .expect("starting js-transform");
        js_transform.stdin.as_mut()
            .expect("opening stdin")
            .write_all(code.as_bytes())
            .expect("failed to write to JS file");
        let exit = js_transform.wait().expect("running js-transform");
        assert!(exit.success());

        let mut decontainerized_js = Command::new("node")
            .arg(filename)
            .arg("test")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .expect("starting decontainerized function");

        decontainerized_js.stdin.as_mut()
            .expect("opening stdin")
            .write_all(requests.as_bytes())
            .expect("failed to write requests");

        let exit = decontainerized_js.wait()
            .expect("running decontainerized function");
        assert!(exit.success(), "non-zero exit code from function");

        let mut stdout = String::new();
        decontainerized_js.stdout.unwrap().read_to_string(&mut stdout)
            .expect("reading stdout");
        // TODO(arjun): We should only remove the file after the calling test
        // case succeeds. How can we do this neatly? Destructors?
        fs::remove_file(filename).expect("removing file");
        let exp = serde_json::from_str::<Exp>(&stdout);

        if exp.is_err() {
            panic!("\n{:?} \nin \n{}", exp, &stdout);
        }

        //println!("\n{:?}", exp);

        //return exp.unwrap();

        // TODO(emily): Make this return a Result so that we can chain all transformations
        let mut transformer = Transformer::new();
        let lifted = transformer.transform(&(exp.unwrap()));
        println!("\n{:?}", lifted);
        return lifted;
    }


    #[test]
    pub fn try_test() {
        let handle = test_harness("try_test.js", r#"
            let containerless = require("../containerless");
            containerless.listen(function(req, resp) {
                resp('Hello, world!');
            });
        "#, "");
    }

    #[test]
    pub fn try_test2() {
        let handle = test_harness("try_test2.js", r#"
            let containerless = require("../containerless");
            let str = 'Got a response!';
            containerless.listen(function(req, resp) {
                // console.log(str);
                console.error(str);
                resp(req);
            });
        "#, "request1
        request2");
    }

    #[test]
    pub fn trace_with_unknown() {
        let handle = test_harness("trace_with_unknown.js", r#"
            let containerless = require("../containerless");
            containerless.listen(function(req, resp) {
                if (req === 'hello') {
                    resp('goodbye');
                }
                else {
                    resp('bad');
                }
            });
        "#, "hello");
        // assert!(false);
    }

}