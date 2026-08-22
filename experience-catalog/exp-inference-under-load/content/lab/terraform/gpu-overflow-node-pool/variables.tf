variable "cluster_name" {
  description = "Name of the existing EKS cluster to attach the overflow node group to."
  type        = string
}

variable "subnet_ids" {
  description = "Subnet IDs the overflow node group can schedule nodes into."
  type        = list(string)
}

variable "node_role_arn" {
  description = "IAM role ARN for the EKS node group (existing GPU node-pool role can be reused)."
  type        = string
}
