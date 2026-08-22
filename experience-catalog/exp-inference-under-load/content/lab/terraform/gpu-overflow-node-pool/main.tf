# GPU overflow node pool - a second instance family, normally idle, that only
# takes traffic during an explicit capacity overflow event (see the third
# decision point in ../../../experience.yaml: "propose a longer-term capacity
# fix with a named tradeoff").
#
# Complete the TODOs, then: terraform init && terraform validate
# (this module is not applied against real infrastructure in the lab).

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

  # TODO: this pool must be a DIFFERENT instance family from the primary
  # g5.2xlarge pool - it exists specifically to give the platform a second
  # burst-capacity option with its own separate quota.
  instance_types = [] # TODO

  # TODO: an overflow pool should sit at zero cost when not in use. Set
  # min_size/desired_size to 0, and a max_size that gives meaningful burst
  # headroom (this pool's job is a handful of nodes during a spike, not a
  # full second production footprint - 4 is enough for this exercise).
  scaling_config {
    min_size     = 0 # TODO confirm this is correct
    max_size     = 0 # TODO
    desired_size = 0 # TODO confirm this is correct
  }

  # TODO: add a taint so this pool does NOT take normal workload traffic by
  # default - only pods with an explicit matching toleration (applied during
  # a real overflow event) should schedule here.
  taint {
    key    = "" # TODO
    value  = "" # TODO
    effect = "" # TODO (one of: NO_SCHEDULE, NO_EXECUTE, PREFER_NO_SCHEDULE)
  }

  tags = {
    Purpose = "gpu-capacity-overflow"
  }
}
