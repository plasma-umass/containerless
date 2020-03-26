mod autoscaler;
mod function_manager;
mod function_table;
mod types;
mod util;
mod windowed_max;
mod decontainerizer;

use function_table::FunctionTable;
use hyper::service::{make_service_fn, service_fn};
use hyper::Server;
use std::convert::Infallible;
use std::sync::Arc;
use tokio::signal::unix::{signal, SignalKind};
use types::*;
use log::{error, info, debug};

async fn handle_req(state: Arc<FunctionTable>, req: Request) -> Result<Response, hyper::Error> {
    let (parts, body) = req.into_parts();
    let path = parts.uri.path();
    let mut split_path = path.splitn(3, '/');
    let _ = split_path.next(); // Drop the leading /
    match split_path.next() {
        Some("readinessProbe") => {
            return Ok(hyper::Response::builder()
                .status(200)
                .body(hyper::Body::from(
                    "To invoke: http://HOSTNAME/dispatcher/FUNCTION-NAME\n",
                ))
                .unwrap());
        },
        Some(function_name) => {
            let function_path = format!("/{}", split_path.next().unwrap_or(""));
            debug!(target: "dispatcher", "received request for function {} with path {}", function_name, function_path);
            let fm = FunctionTable::get_function(&state, function_name).await;
            debug!(target: "dispatcher", "invoking function {} with path {}", function_name, function_path);
            let resp = fm.invoke(parts.method, &function_path, body).await?;
            return Ok(resp);
        }
        None => {
            return Ok(hyper::Response::builder()
                .status(404)
                .body(hyper::Body::from(
                    "To invoke: http://HOSTNAME/dispatcher/FUNCTION-NAME\n",
                ))
                .unwrap());
        }
    }
}

#[tokio::main]
async fn main() {
    env_logger::init();

    info!(target: "dispatcher", "Starting dispatcher");
    let state = FunctionTable::new().await;
    if let Err(err) = FunctionTable::adopt_running_functions(&state).await {
        error!(target: "dispatcher", "adopting functions: {}", err);
        return;
    }

    let make_svc = {
        let state = state.clone();
        make_service_fn(move |_conn| {
            let state = state.clone();
            futures::future::ok::<_, Infallible>(service_fn(move |req| {
                handle_req(state.clone(), req)
            }))
        })
    };

    let addr = ([0, 0, 0, 0], 8080).into();

    let server = Server::bind(&addr).serve(make_svc);

    let addr = server.local_addr();
    info!(target: "dispatcher", "listening on port {}", addr.port());
    server
        .with_graceful_shutdown(async {
            let mut sigterm = signal(SignalKind::terminate()).expect("registering SIGTERM handler");
            sigterm.recv().await;
            println!("Received SIGTERM");
        })
        .await
        .expect("starting server");

    std::process::exit(0);
}
