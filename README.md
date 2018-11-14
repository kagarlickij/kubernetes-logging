# Task
Kubernetes cluster and applications logs have to be stored in centralized location

ElasticSearch was selected as such centralized location, Kibana can be used for data visualisation

# Solution
Filebeat was selected for logs shipping because of it’s lightweight, speed and integration with ELK

Filebeat will be used for shipping logs from Kubernetes cluster and from local log files in docker containers (if any)

More information about Filebeat: https://www.elastic.co/products/beats/filebeat

# Solution diagram
![diagram](https://raw.githubusercontent.com/kagarlickij/k8s-logging/master/diagram.png)

# Lab environment components
[Google Kubernetes Engine](https://cloud.google.com/kubernetes-engine/) was used for Kubernetes cluster hosting

[Elastic Cloud](https://www.elastic.co/cloud) was used for ElasticSearch and Kibana hosting

Besides it ElasticSearch and Kibana were deployed in Kubernetes cluster to show work with logs within Kubernetes cluster only

To generate application logs sample app was developed

Sample app has both Console and File logs enabled by default, you can disable them in `index.js` if you need

Sample app has Filebeat installed and configured, you can change it in `Dockerfile` and `filebeat.yml` respectively

# Lab environment setup
Register trial ElasticCloud account (you’ll need username, password, cloud id, elasticsearch and kibana endpoints during lab)

Register trial Google Cloud account and create project and corresponding service account (project owner permissions are ok for lab) with key in son format

Create Kubernetes cluster using [GCP console](https://console.cloud.google.com/kubernetes/) (accept all defaults except size of the node pull - use at least 3 nodes with 2 CPU / 7.5Gb RAM each)

#### 1. Setup GCP SDK on your machine:

```
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

gcloud auth activate-service-account --key-file ‘$YOUR_SERVICE_ACCOUNT_KEY_FILE’
gcloud config set project $YOUR_PROJECT_NAME
gcloud components install kubectl alpha beta

kubectl create clusterrolebinding cluster-admin-binding --clusterrole cluster-admin --user $(gcloud config get-value account)
```

#### 2. Check connection to cluster:

```
kubectl cluster-info
```

#### 3. Setup helm and tiller:
```
brew install kubernetes-helm
helm init
kubectl create serviceaccount --namespace kube-system tiller
kubectl create clusterrolebinding tiller-cluster-rule --clusterrole=cluster-admin --serviceaccount=kube-system:tiller
kubectl patch deploy --namespace kube-system tiller-deploy -p '{"spec":{"template":{"spec":{"serviceAccount":"tiller"}}}}'
```

#### 4. Check helm and tiller:
```
helm version
```

#### 5. Deploy ElasticSearch, Kibana and Filebeat to Kubernetes:

Deploy using custom charts:
```
helm install ./k8s-logs --name k8s-logs
kubectl expose deployment k8s-logs-kibana --type=LoadBalancer --name=k8s-logs-kibana-exposed
```

Alternatively deploy using official charts:
```
helm install stable/elasticsearch --name elasticsearch --set image.tag=6.4.2
helm install stable/kibana --name kibana --set image.tag=6.4.2,env.ELASTICSEARCH_URL=http://elasticsearch-client.default.svc:9200
kubectl expose deployment kibana --type=LoadBalancer --name=kibana-expose
kubectl create -f filebeat-kubernetes.yaml
```

#### 6. Check ElasticSearch, Kibana and Filebeat deployment:
This will work for custom charts deploy, for deploy from official charts use relevant selectors
```
kubectl get pods --selector=service=k8s-logs-elasticsearch
kubectl get pods --selector=app=kibana
kubectl get pods --namespace=kube-system --selector=app=filebeat
kubectl get service kibana-expose
kubectl run -i --tty --rm debug --image=radial/busyboxplus --restart=Never -- curl http://elasticsearch-client.default.svc:9200/
```

# Sample app build and deploy

#### 1. Build sample app:
```
docker build -t gcr.io/$YOUR_PROJECT_NAME/sample-app-k8s-logs:latest . --no-cache
```

#### 2. Check sample app locally:
```
docker run -p 5000:5000 -d gcr.io/$YOUR_PROJECT_NAME/sample-app-k8s-logs:latest
python -m webbrowser 'http://localhost:5000'
```

#### 3. Push sample app to your lab GCR:
```
gcloud auth configure-docker
docker push gcr.io/$YOUR_PROJECT_NAME/sample-app-k8s-logs:latest
```

#### 4. Deploy sample app to Kubernetes:
```
kubectl run sample-app-k8s-logs --image=gcr.io/$YOUR_PROJECT_NAME/sample-app-k8s-logs:latest --port=5000 --labels=app=sample-app-k8s-logs
kubectl expose deployment sample-app-k8s-logs --type=LoadBalancer --port=80 --target-port=5000 --name=sample-app-k8s-logs
```

#### 5. Check sample app deployment:
```
kubectl get pods --selector=app=sample-app-k8s-logs
kubectl get service sample-app-k8s-logs
```

#### 6. Open EXTERNAL-IP of 'sample-app-k8s-logs' service in your browser and refresh page several times

#### 7. Check sample app console logs (sent to k8s):
```
kubectl logs $APP_POD_NAME
```

#### 8. Check sample app local log file (not sent to k8s):
```
kubectl exec -i -t $APP_POD_NAME -- cat /app/app.log
```

# Check results
Open Kibana UI, go to Discover, enter `filebeat-*` as a pattern and check logs from Kubernetes cluster, app Console and File output, it should look like http://prntscr.com/lcvfw9

Please note that Filebeat for file logs is installed and configured in sample app sources
