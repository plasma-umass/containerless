use dispatcher_agent_lib :: trace_runtime :: Containerless ; use std :: collections :: HashMap ; mod function_loops ; mod function_hi ; pub fn init ( ) -> HashMap < & 'static str , Containerless > { let mut ht : HashMap < & 'static str , Containerless > = HashMap :: new ( ) ; ht . insert ( "loops" , function_loops :: containerless ) ; ht . insert ( "hi" , function_hi :: containerless ) ; return ht ; }