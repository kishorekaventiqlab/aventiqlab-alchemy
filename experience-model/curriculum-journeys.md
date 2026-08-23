# Curriculum Journeys

Rendered view of [`curriculum-journeys.yaml`](curriculum-journeys.yaml). A journey is a domain-scoped, ordered path through the experience catalog — **not** a course list. The primary object in AventiqLab's learning architecture is always the Experience; a journey is just one lens for browsing the catalog by domain.

| Domain | Journey | Experiences (in order) |
|---|---|---|
| Foundations | Foundations Journey | Deploy an AI Inference Service |
| Cloud Platform Engineering | Cloud Platform Engineering Journey | Design Multi-Tenant AI Infrastructure |
| Container Platforms | Container Platforms Journey | *(none yet — stub domain)* |
| Kubernetes | Kubernetes Journey | Build an Autoscaling Inference Platform → Operate an AI Inference Platform Under Load |
| Networking | Networking Journey | *(none yet — stub domain)* |
| IaC & Automation | IaC & Automation Journey | *(none yet — stub domain)* |
| CI/CD | CI/CD Journey | Roll Out a New Model Safely |
| AI Infrastructure | AI Infrastructure Journey | Diagnose GPU Capacity Exhaustion → Design Multi-Tenant AI Infrastructure |
| GPU Engineering | GPU Engineering Journey | Diagnose GPU Capacity Exhaustion → Optimize GPU Utilization → Operate an AI Inference Platform Under Load |
| Model Serving | Model Serving Journey | Deploy an AI Inference Service → Build an Autoscaling Inference Platform → Diagnose Model-Serving Latency → Design Highly Available Model Serving |
| Inference Engineering | Inference Engineering Journey | Optimize GPU Utilization |
| MLOps | MLOps Journey | Roll Out a New Model Safely → Fine-Tune and Register a Production Adapter → Troubleshoot a Failing ML Pipeline |
| LLMOps | LLMOps Journey | Build a Retrieval Pipeline with a Measured Baseline → Build an Agent That Completes a Multi-Step Task With Approval Gates → Operate an LLM Platform Under Traffic Growth → Diagnose a Broken RAG Pipeline |
| AI Platform Engineering | AI Platform Engineering Journey | Design an Internal AI Platform for Multiple Teams |
| Observability | Observability Journey | Diagnose Model-Serving Latency → Handle a Production AI Incident |
| AI Reliability / SRE | AI Reliability / SRE Journey | Handle a Production AI Incident → Operate an AI Inference Platform Under Load |
| AI Security | AI Security Journey | Contain an Indirect Prompt-Injection Incident in a Production Agent |
| Capacity Engineering | Capacity Engineering Journey | Diagnose GPU Capacity Exhaustion |
| Cost Engineering | Cost Engineering Journey | Reduce AI Platform Infrastructure Cost |
| Distributed AI Systems | Distributed AI Systems Journey | *(none yet — stub domain)* |
| Platform Architecture | Platform Architecture Journey | Design Multi-Tenant AI Infrastructure → Design Highly Available Model Serving → Design an Internal AI Platform for Multiple Teams |

Several experiences appear in more than one journey — e.g. `exp-inference-under-load` belongs to both the Kubernetes and AI Reliability/SRE journeys, because it genuinely develops both. Journeys are a view over the catalog, not a partition of it.
