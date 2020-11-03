use super::function_manager::FunctionManager;
use super::types::*;
use crate::error::Error;
use hyper_timeout::TimeoutConnector;
use std::time::Duration;

use shared::response::*;

use futures::lock::Mutex;
use k8s;
use lazy_static::lazy_static;
use regex::Regex;
use std::collections::HashMap;

struct FunctionTableImpl {
    functions: HashMap<String, FunctionManager>,
    http_client: HttpClient,
    short_deadline_http_client: HttpClient,
    k8s_client: K8sClient,
}

pub struct FunctionTable {
    inner: Mutex<FunctionTableImpl>,
    decontainerized_functions: HashMap<&'static str, Containerless>,
    upgrade_pending: Arc<AtomicBool>,
}

impl FunctionTable {
    pub async fn new(
        decontainerized_functions: HashMap<&'static str, Containerless>,
    ) -> Arc<FunctionTable> {
        let functions = HashMap::new();
        let k8s_client = Arc::new(
            k8s::client::Client::new("containerless")
                .await
                .expect("initializing k8s client"),
        );

        // We use this client to issue requests to serverless functions. So, we expect
        // responses within 15 seconds.
        let mut connector = TimeoutConnector::new(hyper::client::HttpConnector::new());
        connector.set_connect_timeout(Some(Duration::from_secs(15)));
        let http_client = Arc::new(hyper::Client::builder().build(connector));

        // We use this client to send readiness probes in a tight loop.
        let mut connector = TimeoutConnector::new(hyper::client::HttpConnector::new());
        connector.set_connect_timeout(Some(Duration::from_secs(1)));

        let short_deadline_http_client = Arc::new(hyper::Client::builder().build(connector));
        let inner = FunctionTableImpl {
            functions,
            http_client,
            short_deadline_http_client,
            k8s_client,
        };
        let upgrade_pending = Arc::new(AtomicBool::new(false));
        return Arc::new(FunctionTable {
            inner: Mutex::new(inner),
            decontainerized_functions,
            upgrade_pending,
        });
    }

    pub async fn adopt_running_functions(self_: &Arc<FunctionTable>) -> Result<(), kube::Error> {
        lazy_static! {
            static ref RE: Regex = Regex::new("^function-vanilla-(.*)$").unwrap();
        }
        let mut inner = self_.inner.lock().await;
        let replica_sets = inner.k8s_client.list_replica_sets().await?;
        let pods: Vec<String> = inner
            .k8s_client
            .list_pods()
            .await?
            .into_iter()
            .map(|snapshot| snapshot.name)
            .collect();
        for (rs_name, spec) in replica_sets.into_iter() {
            match RE.captures(&rs_name) {
                None => {
                    debug!(target: "dispatcher", "Ignoring ReplicaSet {}", &rs_name);
                }
                Some(captures) => {
                    debug!(target: "dispatcher", "Adopting ReplicaSet {}", &rs_name);
                    let name = captures.get(1).unwrap().as_str();
                    let num_replicas = spec.replicas.unwrap();
                    let is_tracing = pods.contains(&format!("function-tracing-{}", &rs_name));
                    let fm = FunctionManager::new(
                        inner.k8s_client.clone(),
                        inner.http_client.clone(),
                        inner.short_deadline_http_client.clone(),
                        Arc::downgrade(self_),
                        name.to_string(),
                        super::state::CreateMode::Adopt {
                            num_replicas,
                            is_tracing,
                        },
                        self_
                            .decontainerized_functions
                            .get(name)
                            .map(|ptrptr| *ptrptr),
                        self_.upgrade_pending.clone(),
                    )
                    .await;
                    inner.functions.insert(name.to_string(), fm.clone());
                }
            }
        }

        return Ok(());
    }

    pub async fn shutdown(self_: Arc<FunctionTable>, name: &str) {
        let mut inner = self_.inner.lock().await;
        match inner.functions.remove(name) {
            None => eprintln!("{} not in hash table", name),
            Some(mut fm) => {
                fm.shutdown().await;
            }
        }
    }

    pub async fn orphan(self_: Arc<FunctionTable>) {
        let mut inner = self_.inner.lock().await;
        // Unnecessary sequential awaits
        for (_name, function_manager) in inner.functions.drain() {
            function_manager.orphan().await;
        }
    }

    pub async fn get_function(
        self_: &Arc<FunctionTable>, name: &str,
    ) -> Result<FunctionManager, Error> {
        let mut inner = self_.inner.lock().await;
        match inner.functions.get(name) {
            None => {
                // Check to see if the function is available in storage
                let storage_resp =
                    reqwest::get(&format!("http://storage:8080/get_function/{}", name)).await?;
                if let Err(err) =
                    response_into_result(storage_resp.status().as_u16(), storage_resp.text().await?)
                {
                    return Err(Error::Storage(format!("{:?}", err)));
                }
                let fm = FunctionManager::new(
                    inner.k8s_client.clone(),
                    inner.http_client.clone(),
                    inner.short_deadline_http_client.clone(),
                    Arc::downgrade(self_),
                    name.to_string(),
                    super::state::CreateMode::New,
                    self_
                        .decontainerized_functions
                        .get(name)
                        .map(|ptrptr| *ptrptr),
                    self_.upgrade_pending.clone(),
                )
                .await;
                inner.functions.insert(name.to_string(), fm.clone());
                return Ok(fm);
            }
            Some(value) => {
                return Ok(value.clone());
            }
        }
    }

    pub async fn function_manager_exists(self_: &Arc<FunctionTable>, name: &str) -> bool {
        let inner = self_.inner.lock().await;
        match inner.functions.get(name) {
            None => false,
            Some(_value) => true,
        }
    }
}
