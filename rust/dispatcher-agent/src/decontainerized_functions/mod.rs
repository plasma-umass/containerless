use super::trace_runtime::Containerless;
use std::collections::HashMap;
pub fn init() -> HashMap<&'static str, Containerless> {
    let mut ht: HashMap<&'static str, Containerless> = HashMap::new();
    return ht;
}