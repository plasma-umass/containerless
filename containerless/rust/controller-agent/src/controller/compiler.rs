//! The compiler uses `cargo build` in the `/src` directory, so it must
//! run as a single threaded task.
use super::error::Error;
use crate::trace_compiler;

use shared::common::*;

use futures::channel::mpsc;
use k8s;
use proc_macro2::Span;
use quote::__private::TokenStream;
use quote::quote;
use std::fs;
use std::io::{self, Write};
use std::process::Stdio;
use std::time::{Duration, Instant};
use syn::Ident;
use tokio::process::Command;
use tokio::task;

enum Message {
    Compile {
        name: String,
        code: Bytes,
    },
    Shutdown {
        done: oneshot::Sender<()>,
    },
    RecompileDispatcher {
        started_compiling: oneshot::Sender<()>,
    },
    ResetDispatcher {
        started_compiling: oneshot::Sender<()>,
    },
    CreateFunction {
        name: String,
        exclusive: bool,
        done: oneshot::Sender<()>,
    },
    ResetFunction {
        name: String,
        started_compiling: oneshot::Sender<()>,
        new_dispatcher_deployed: oneshot::Sender<()>,
    },
    GetDispatcherVersion {
        done: oneshot::Sender<usize>,
    },
}

#[derive(PartialEq)]
enum CompileStatus {
    Vanilla,
    Compiling,
    Compiled,
    Error,
}

pub struct Compiler {
    send_message: mpsc::Sender<Message>,
    is_compiling_now: AtomicBool,
}

fn gen_function_table_entry(name: &str) -> TokenStream {
    let q_id = Ident::new(&format!("function_{}", name), Span::call_site());
    return quote! {
        ht.insert(#name, #q_id::containerless);
    };
}

fn gen_function_mod(name: &str) -> TokenStream {
    let q_id = Ident::new(&format!("function_{}", name), Span::call_site());
    return quote! {
        mod  #q_id;
    };
}

fn gen_function_table_file(table: &[String]) -> TokenStream {
    let q_mods: Vec<_> = table.iter().map(|x| gen_function_mod(x)).collect();
    let q_inserts: Vec<_> = table.iter().map(|x| gen_function_table_entry(x)).collect();
    return quote! {
        // This file is generated by the compiler in controller-agent.
        use dispatcher_agent_lib::trace_runtime::Containerless;
        use std::collections::HashMap;
        #(#q_mods)*

        pub fn init() -> HashMap<&'static str, Containerless> {
            let mut ht: HashMap<&'static str, Containerless> = HashMap::new();
            #(#q_inserts)*
            return ht;
        }
    };
}

pub fn dispatcher_deployment_spec(version: usize) -> k8s::Deployment {
    use k8s::*;
    return DeploymentBuilder::new()
        .metadata(
            ObjectMetaBuilder::new()
                .name("dispatcher")
                .namespace(NAMESPACE)
                .label("app", "dispatcher")
                .label("version", version.to_string())
                .build(),
        )
        .spec(
            DeploymentSpecBuilder::new()
                .replicas(1)
                .selector("app", "dispatcher")
                .template(
                    PodTemplateSpecBuilder::new()
                        .metadata(
                            ObjectMetaBuilder::new()
                                .label("app", "dispatcher")
                                .label("version", version.to_string())
                                .build(),
                        )
                        .spec(
                            PodSpecBuilder::new()
                                .container(
                                    ContainerBuilder::new()
                                        .name("dispatcher")
                                        .image("localhost:32000/dispatcher")
                                        .expose_port("http", 8080)
                                        .always_pull()
                                        .env("RUST_LOG", std::env::var("RUST_LOG").unwrap())
                                        .env("Version", format!("V{}", version))
                                        .http_readiness_probe(1, "/readinessProbe/", 8080)
                                        .build(),
                                )
                                .build(),
                        )
                        .build(),
                )
                /*
                .strategy(DeploymentStrategyBuilder::new()
                    .type_(DeploymentStrategyType::RollingUpdate)
                    .rolling_update(RollingUpdateDeploymentBuilder::new()
                        .max_surge(1)
                        .max_unavailable(0)
                        .build()
                    )
                    .build()
                )
                */
                .build(),
        )
        .build();
}

fn generate_decontainerized_functions_mod(known_functions: &HashMap<String, CompileStatus>) {
    let available_functions = known_functions
        .iter()
        .filter(|(_, v)| **v != CompileStatus::Error)
        .map(|(k, _)| k.clone())
        .collect::<Vec<_>>();

    std::fs::write(
        format!(
            "{}/dispatcher-agent/src/decontainerized_functions/mod.rs",
            ROOT.as_str()
        ),
        format!("{}", gen_function_table_file(&available_functions)),
    )
    .expect("cannot write function table file");
}

async fn wait_for_dispatcher_patch_to_complete(
    k8s: &k8s::Client, desired_version: usize,
) -> Result<(), Error> {
    let interval = Duration::from_secs(1);
    let timeout = Duration::from_secs(60);
    let end_time = Instant::now() + timeout;
    let label = format!("app=dispatcher,version={}", desired_version);
    loop {
        let dispatcher_pods = k8s
            .list_pods_by_label_and_field(label.clone(), "status.phase=Running")
            .await?;
        if dispatcher_pods.len() == 1 {
            return Ok(());
        }
        tokio::time::delay_for(interval).await;
        if Instant::now() >= end_time {
            break;
        }
    }
    return Err(Error::Containerless(
        "Could not patch dispatcher deployment.".to_string(),
    ));
}

async fn compiler_task(compiler: Arc<Compiler>, mut recv_message: mpsc::Receiver<Message>) {
    let k8s = k8s::Client::from_kubeconfig_file(NAMESPACE)
        .await
        .expect("creating k8s::Client");
    let mut next_version = 1;

    let mut known_functions: HashMap<String, CompileStatus> = HashMap::new();

    while let Some(message) = recv_message.next().await {
        match message {
            Message::RecompileDispatcher { started_compiling } => {
                if !(compiler.cargo_build(Some(started_compiling)).await) {
                    error!(target: "controller", "The code for dispatcher-agent is in a broken state. The system may not work.");
                    continue;
                }
                next_version += 1;
                super::graceful_sigterm::delete_dynamic_resources(&k8s, false)
                    .await
                    .expect("deleting dynamically created resources");
                k8s.patch_deployment(dispatcher_deployment_spec(next_version))
                    .await
                    .expect("patching dispatcher deployment");
                info!(target: "controller", "Patched dispatcher deployment");
            }
            Message::ResetDispatcher { started_compiling } => {
                info!(target: "controller", "clearing Controller state");
                known_functions.clear();
                generate_decontainerized_functions_mod(&known_functions);
                if !(compiler.cargo_build(Some(started_compiling)).await) {
                    error!(target: "controller", "The code for dispatcher-agent is in a broken state. The system may not work.");
                    continue;
                }
                next_version += 1;
                super::graceful_sigterm::delete_dynamic_resources(&k8s, false)
                    .await
                    .expect("deleting dynamically created resources");
                k8s.patch_deployment(dispatcher_deployment_spec(next_version))
                    .await
                    .expect("patching dispatcher deployment");
                info!(target: "controller", "Patched dispatcher deployment");
            }
            Message::CreateFunction {
                name,
                done,
                exclusive,
            } => {
                if known_functions.contains_key(&name) {
                    known_functions.insert(name.clone(), CompileStatus::Error);
                    error!(target: "controller", "creating function {} twice", name);
                    continue;
                }
                if exclusive {
                    known_functions.clear();
                }
                known_functions.insert(name.clone(), CompileStatus::Vanilla);
                done.send(()).expect("sending done");
            }
            Message::ResetFunction {
                name,
                started_compiling,
                new_dispatcher_deployed,
            } => {
                info!(target: "controller", "clearing compiled function {}", name);
                let rs_path = format!(
                    "{}/dispatcher-agent/src/decontainerized_functions/function_{}.rs",
                    ROOT.as_str(),
                    &name
                );
                let json_path = format!(
                    "{}/dispatcher-agent/src/decontainerized_functions/function_{}.json",
                    ROOT.as_str(),
                    &name
                );
                match known_functions.remove(&name) {
                    None => {
                        error!(target: "controller", "clearing compiled function {}: did not find function in known_functions", name);
                        started_compiling.send(()).expect("sending done");
                        new_dispatcher_deployed.send(()).expect("sending done")
                    }
                    Some(status) => match status {
                        CompileStatus::Vanilla => {
                            info!(target: "controller", "calling reset on vanilla function: {}", name);
                            started_compiling.send(()).expect("sending done");
                            new_dispatcher_deployed.send(()).expect("sending done");
                        }
                        CompileStatus::Compiled => {
                            info!(target: "controller", "clearing compiled function {}: found function in known_functions", name);
                            if let Err(err) = fs::remove_file(rs_path) {
                                known_functions.insert(name.clone(), CompileStatus::Error);
                                error!(target: "controller", "error reseting trace for {}: {}", &name, err);
                                continue;
                            }
                            if let Err(err) = fs::remove_file(json_path) {
                                known_functions.insert(name.clone(), CompileStatus::Error);
                                error!(target: "controller", "error reseting trace for {}: {}", &name, err);
                                continue;
                            }
                            generate_decontainerized_functions_mod(&known_functions);
                            if !(compiler.cargo_build(Some(started_compiling)).await) {
                                known_functions.insert(name.clone(), CompileStatus::Error);
                                generate_decontainerized_functions_mod(&known_functions);
                                error!(target: "controller", "The code for dispatcher-agent is in a broken state. The system may not work.");
                                continue;
                            }
                            next_version += 1;
                            k8s.patch_deployment(dispatcher_deployment_spec(next_version))
                                .await
                                .expect("patching dispatcher deployment");
                            info!(target: "controller", "Patched dispatcher deployment");

                            if let Err(err) =
                                wait_for_dispatcher_patch_to_complete(&k8s, next_version).await
                            {
                                error!(target: "controller", "Error while waiting for dispatcher to patch: {:?}", err);
                                continue;
                            }

                            new_dispatcher_deployed.send(()).expect("sending done");
                        }
                        CompileStatus::Compiling => {
                            error!(target: "controller", "trace not currently yet built for function {}", name);
                            continue;
                        }
                        CompileStatus::Error => {
                            error!(target: "controller", "calling reset on a function with an error: {}", name);
                            continue;
                        }
                    },
                }
            }
            Message::Compile { name, code } => {
                info!(target: "controller", "compiler task received trace for {}", &name);
                next_version += 1;
                fs::write(
                    format!(
                        "{}/dispatcher-agent/src/decontainerized_functions/function_{}.json",
                        ROOT.as_str(),
                        &name
                    ),
                    &code,
                )
                .expect("failed to create trace (JSON) file");
                let trace_compile_err = trace_compiler::compile(
                    name.clone(),
                    &format!(
                        "{}/dispatcher-agent/src/decontainerized_functions/function_{}.rs",
                        ROOT.as_str(),
                        &name
                    ),
                    &String::from_utf8_lossy(&code),
                );
                if let Err(err) = trace_compile_err {
                    known_functions.insert(name.clone(), CompileStatus::Error);
                    error!(target: "controller", "error compiling trace for {}: {}", &name, err);
                    continue;
                }

                known_functions.insert(name.clone(), CompileStatus::Compiling);
                generate_decontainerized_functions_mod(&known_functions);

                if !(compiler.cargo_build(None).await) {
                    known_functions.insert(name.clone(), CompileStatus::Error);
                    generate_decontainerized_functions_mod(&known_functions);
                    continue;
                }
                known_functions.insert(name.clone(), CompileStatus::Compiled);

                // TODO(arjun): If several traces are queued up, we should batch
                // them together before updating the deployment.
                k8s.patch_deployment(dispatcher_deployment_spec(next_version))
                    .await
                    .expect("patching dispatcher deployment");
                info!(target: "controller", "Patched dispatcher deployment");
            }
            Message::Shutdown { done } => {
                super::graceful_sigterm::delete_dynamic_resources(&k8s, true)
                    .await
                    .expect("deleting dynamically created resources");
                info!(target: "controller", "ending compiler task (received shutdown message)");
                done.send(()).expect("sending done");
                return;
            }
            Message::GetDispatcherVersion { done } => {
                // I don't think this is quite right.....
                loop {
                    tokio::time::delay_for(Duration::from_secs(1)).await;
                    match k8s.get_deployment_status("dispatcher").await {
                        Ok(status) => {
                            if status.replicas != 1 {
                                continue; // continue inner loop
                            }
                            done.send(status.observed_generation).expect("sending done");
                            break; // break from inner loop
                        }
                        Err(err) => {
                            error!(target: "controller", "error getting dispatcher version {:?}", err);
                            break; // break from inner loop
                        }
                    }
                }
            }
        }
    }

    info!(target: "controller", "ending compiler task (all senders closed)");
    return;
}

impl Compiler {
    pub fn new() -> Arc<Self> {
        let (send_message, recv_message) = mpsc::channel(1);
        let is_compiling_now = AtomicBool::new(false);
        let compiler = Arc::new(Compiler {
            send_message,
            is_compiling_now,
        });
        task::spawn(compiler_task(compiler.clone(), recv_message));
        return compiler;
    }

    pub async fn cargo_build(&self, started_compiling: Option<oneshot::Sender<()>>) -> bool {
        let was_compiling = self.is_compiling_now.swap(true, SeqCst);
        if was_compiling {
            panic!("cargo was already running. This should not happen");
        }
        if let Some(sender) = started_compiling {
            sender
                .send(())
                .expect("could not send started_compiling message");
        }
        info!(target: "controller", "Running cargo build on dispatcher-agent. Output is suppressed unless an error occurs.");
        let cargo_result = Command::new("cargo")
            .arg("build")
            .current_dir(&format!("{}/dispatcher-agent", ROOT.as_str()))
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .expect("waiting for cargo to complete");
        self.is_compiling_now.store(false, SeqCst);
        if !cargo_result.status.success() {
            io::stderr().write(&cargo_result.stderr).unwrap();
            io::stdout().write(&cargo_result.stdout).unwrap();
            error!(target: "dispatcher", "cargo build failed");
            return false;
        }
        return true;
    }

    fn send_message_non_blocking(&self, message: Message) {
        let mut send_message = self.send_message.clone();
        task::spawn(async move {
            send_message
                .send(message)
                .await
                .expect("compiler task shutdown")
        });
    }

    pub fn compile(&self, name: String, code: Bytes) {
        self.send_message_non_blocking(Message::Compile { name, code });
    }

    pub async fn shutdown(&self) {
        let (send, recv) = oneshot::channel();
        let mut send_message = self.send_message.clone();
        send_message
            .send(Message::Shutdown { done: send })
            .await
            .expect("compiler task shutdown");
        return recv.await.expect("compiler task shutdown");
    }

    pub fn ok_if_not_compiling(&self) -> http::StatusCode {
        if !self.is_compiling_now.load(SeqCst) {
            return http::StatusCode::OK;
        } else {
            return http::StatusCode::SERVICE_UNAVAILABLE;
        }
    }

    /// recompile_dispatcher blocks until "cargo build" starts running.
    pub async fn recompile_dispatcher(&self) -> http::StatusCode {
        let (send, recv) = oneshot::channel();
        self.send_message_non_blocking(Message::RecompileDispatcher {
            started_compiling: send,
        });
        recv.await.expect("compiler task shutdown");
        return http::StatusCode::OK;
    }

    pub async fn reset_dispatcher(&self) -> http::StatusCode {
        let (send, recv) = oneshot::channel();
        self.send_message_non_blocking(Message::ResetDispatcher {
            started_compiling: send,
        });
        recv.await.expect("compiler task shutdown");
        return http::StatusCode::OK;
    }

    pub async fn reset_function(&self, name: &str) -> http::StatusCode {
        let (send, recv) = oneshot::channel();
        let (send2, recv2) = oneshot::channel();
        self.send_message_non_blocking(Message::ResetFunction {
            name: name.to_string(),
            started_compiling: send,
            new_dispatcher_deployed: send2,
        });

        match (recv.await, recv2.await) {
            (Ok(_), Ok(_)) => http::StatusCode::OK,
            (other1, other2) => {
                error!(target: "controller", "Recieved error when clearing compiled trace: {:?}\n(ERRCODE {:?})", other1, other2);
                http::StatusCode::INTERNAL_SERVER_ERROR
            }
        }
    }

    pub async fn create_function(&self, name: &str, exclusive: bool) -> http::StatusCode {
        let (send, recv) = oneshot::channel();
        self.send_message_non_blocking(Message::CreateFunction {
            name: name.to_string(),
            exclusive,
            done: send,
        });
        recv.await.expect("compiler task shutdown");
        return http::StatusCode::OK;
    }

    pub async fn dispatcher_version(&self) -> usize {
        let (send, recv) = oneshot::channel();
        self.send_message_non_blocking(Message::GetDispatcherVersion { done: send });
        recv.await.unwrap()
    }
}
