terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

resource "aws_eks_node_group" "gpu_overflow" {
  cluster_name    = var.cluster_name
  node_group_name = "gpu-overflow-g5-4xlarge"
  node_role_arn   = var.node_role_arn
  subnet_ids      = var.subnet_ids

  instance_types = ["g5.4xlarge"]

  scaling_config {
    min_size     = 0
    max_size     = 4
    desired_size = 0
  }

  taint {
    key    = "overflow-only"
    value  = "true"
    effect = "NO_SCHEDULE"
  }

  tags = {
    Purpose = "gpu-capacity-overflow"
  }
}
