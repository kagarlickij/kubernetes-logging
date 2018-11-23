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

# Cleanup (automatic)
Filebeat is set to create new ElasticSearch index each day

Each day records older than 7 days are deleted via query from all indices. The only exception is for IAM logs, they are not deleted via query and present until index is present

[Curator](https://www.elastic.co/guide/en/elasticsearch/client/curator/current/about.html) is used to automatically delete indices older than 30 days

Curator is executed as k8s [CronJob](https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/)

Schedule for Curator execution and age of indices to delete can be changed in `k8s-logs/charts/curator/valuess.yaml`

Since there's no official Docker image for Curator you can use [mine](https://hub.docker.com/r/kagarlickij/elasticsearch-curator/) or build your own with `curator/Dockerfile`

# Data export/import to/from local file

#### 1. Export mapping
```
kubectl run -i --rm --tty elasticsearch-dump-executor --overrides='
{
    "kind": "Pod",
    "apiVersion": "v1",
    "spec": {
        "containers": [{
            "name": "elasticsearch-dump-executor",
            "image": "kagarlickij/elasticsearch-dump:latest",
            "command": ["/usr/local/bin/elasticdump"],
            "args": ["--input=http://k8s-logs-elasticsearch.default.svc:9200/filebeat-6.4.2-2018.11.21", "--output=/usr/share/elastic/dump/filebeat-20181121-mapping.json", "--type=mapping"],
            "volumeMounts": [{
              "mountPath": "/usr/share/elastic/dump",
              "name": "elasticsearch-dump-storage"
            }]
        }],
        "volumes": [{
            "name": "elasticsearch-dump-storage",
            "persistentVolumeClaim": {
                "claimName": "elasticsearch-dump-storage-claim"
            }
        }]
    }
}
' --image=kagarlickij/elasticsearch-dump:latest --restart=Never
```

#### 2. Export data
```
kubectl run -i --rm --tty elasticsearch-dump-executor --overrides='
{
    "kind": "Pod",
    "apiVersion": "v1",
    "spec": {
        "containers": [{
            "name": "elasticsearch-dump-executor",
            "image": "kagarlickij/elasticsearch-dump:latest",
            "command": ["/usr/local/bin/elasticdump"],
            "args": ["--input=http://k8s-logs-elasticsearch.default.svc:9200/filebeat-6.4.2-2018.11.21", "--output=/usr/share/elastic/dump/filebeat-20181121-data.json", "--type=data"],
            "volumeMounts": [{
              "mountPath": "/usr/share/elastic/dump",
              "name": "elasticsearch-dump-storage"
            }]
        }],
        "volumes": [{
            "name": "elasticsearch-dump-storage",
            "persistentVolumeClaim": {
                "claimName": "elasticsearch-dump-storage-claim"
            }
        }]
    }
}
' --image=kagarlickij/elasticsearch-dump:latest --restart=Never
```

#### 3. Start temporary pod to copy data from
```
kubectl run -i --rm --tty elasticsearch-dump-reader --overrides='
{
    "kind": "Pod",
    "apiVersion": "v1",
    "spec": {
        "containers": [{
            "name": "elasticsearch-dump-reader",
            "image": "kagarlickij/elasticsearch-dump:latest",
            "command": ["/bin/bash"],
            "args": ["-ecx", "while :; do printf '.'; sleep 5 ; done"],
            "volumeMounts": [{
              "mountPath": "/usr/share/elastic/dump",
              "name": "elasticsearch-dump-storage"
            }]
        }],
        "volumes": [{
            "name": "elasticsearch-dump-storage",
            "persistentVolumeClaim": {
                "claimName": "elasticsearch-dump-storage-claim"
            }
        }]
    }
}
' --image=kagarlickij/elasticsearch-dump:latest --restart=Never
```

#### 4. Copy exported files to local filesystem
```
kubectl cp elasticsearch-dump-reader:/usr/share/elastic/dump/filebeat-20181121-mapping.json ./filebeat-20181121-mapping.json
kubectl cp elasticsearch-dump-reader:/usr/share/elastic/dump/filebeat-20181121-data.json ./filebeat-20181121-data.json
```

#### 5. Terminate temporary pod
```
kubectl delete pod elasticsearch-dump-reader
```

#### 6. Import mapping to new cluster
```
kubectl run -i --rm --tty elasticsearch-dump-executor --overrides='
{
    "kind": "Pod",
    "apiVersion": "v1",
    "spec": {
        "containers": [{
            "name": "elasticsearch-dump-executor",
            "image": "kagarlickij/elasticsearch-dump:latest",
            "command": ["/usr/local/bin/elasticdump"],
            "args": ["--input=/usr/share/elastic/dump/filebeat-20181121-mapping.json", "--output=http://k8s-logs-elasticsearch.default.svc:9200/filebeat-6.4.2-2018.11.21", "--type=mapping"],
            "volumeMounts": [{
              "mountPath": "/usr/share/elastic/dump",
              "name": "elasticsearch-dump-storage"
            }]
        }],
        "volumes": [{
            "name": "elasticsearch-dump-storage",
            "persistentVolumeClaim": {
                "claimName": "elasticsearch-dump-storage-claim"
            }
        }]
    }
}
' --image=kagarlickij/elasticsearch-dump:latest --restart=Never
```

#### 7. Import data to new cluster
```
kubectl run -i --rm --tty elasticsearch-dump-executor --overrides='
{
    "kind": "Pod",
    "apiVersion": "v1",
    "spec": {
        "containers": [{
            "name": "elasticsearch-dump-executor",
            "image": "kagarlickij/elasticsearch-dump:latest",
            "command": ["/usr/local/bin/elasticdump"],
            "args": ["--input=/usr/share/elastic/dump/filebeat-20181121-data.json", "--output=http://k8s-logs-elasticsearch.default.svc:9200/filebeat-6.4.2-2018.11.21", "--type=data"],
            "volumeMounts": [{
              "mountPath": "/usr/share/elastic/dump",
              "name": "elasticsearch-dump-storage"
            }]
        }],
        "volumes": [{
            "name": "elasticsearch-dump-storage",
            "persistentVolumeClaim": {
                "claimName": "elasticsearch-dump-storage-claim"
            }
        }]
    }
}
' --image=kagarlickij/elasticsearch-dump:latest --restart=Never
```
