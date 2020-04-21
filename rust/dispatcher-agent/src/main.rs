mod autoscaler;
mod decontainerized_functions;
mod error;
mod function_manager;
mod function_table;
mod trace_runtime;
mod types;
mod util;
mod windowed_max;

use function_table::FunctionTable;
use tokio::signal::unix::{signal, SignalKind};
use types::*;
use warp::Filter;

async fn readiness_handler() -> Result<impl warp::Reply, warp::Rejection> {
    return Ok(hyper::Response::builder()
        .status(200)
        .body(hyper::Body::from(
            "To invoke: http://HOSTNAME/dispatcher/FUNCTION-NAME\n",
        ))
        .unwrap());
}

async fn dispatcher_handler(function_name: String, mut function_path: String, method: http::Method, body: bytes::Bytes, state: Arc<FunctionTable>) -> Result<impl warp::Reply, warp::Rejection>  {
    debug!(target: "dispatcher", "received request for function {} with path {}", function_name, function_path);
    let mut fm = FunctionTable::get_function(&state, &function_name).await;
    debug!(target: "dispatcher", "invoking function {} with path {}", function_name, function_path);
    let body = hyper::Body::from(body);
    function_path = format!("/{}", function_path);
    return match fm.invoke(method, &function_path, body).await {
        Ok(resp) => Ok(resp),
        Err(err) =>
            Ok(hyper::Response::builder()
            .status(500)
            .body(hyper::Body::from(format!("Error invoking function {}", err)))
            .unwrap())
    };
}

#[tokio::main]
async fn main() {
    env_logger::init();

    info!(target: "dispatcher", "Started dispatcher");
    let state = FunctionTable::new().await;
    if let Err(err) = FunctionTable::adopt_running_functions(&state).await {
        error!(target: "dispatcher", "adopting functions: {}", err);
        return;
    }

    let extract_state = {
        let state = state.clone();
        warp::any().map(move || state.clone())
    };
    
    let readiness_route = warp::get()
        .and(warp::path!("readinessProbe"))
        .and_then(readiness_handler);

    let dispatcher_route = warp::path!(String / String)
        .and(warp::method())
        .and(warp::filters::body::bytes())
        .and(extract_state)
        .and_then(dispatcher_handler);

    let paths = readiness_route
        .or(dispatcher_route);

    info!(target: "dispatcher", "started listening");
    let (_addr, server) = warp::serve(paths)
        .bind_with_graceful_shutdown(([0, 0, 0, 0], 8080), async {
            let mut sigterm = signal(SignalKind::terminate()).expect("registering SIGTERM handler");
            sigterm.recv().await;
            println!("Received SIGTERM");
        });
    server.await;
    FunctionTable::orphan(state).await;
    std::process::exit(0);
}
