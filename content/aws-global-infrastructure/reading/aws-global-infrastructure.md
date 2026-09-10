# AWS Global Infrastructure

Every AWS resource you ever create lives somewhere physical. This reading gives you the four ideas that describe where: **Regions**, **Availability Zones**, **edge locations**, and **accounts**. Everything later in the AWS Transformation program assumes you hold these.

## 1. Regions

A **Region** is a geographic area that contains a cluster of AWS data centres. Each Region has a code (`us-east-1`, `eu-west-2`, `ap-south-1`) and is fully independent of every other Region. Independence is the point: a fault, a deployment mistake, or a legal order in one Region does not touch another.

You choose a Region for a workload on four axes, usually in this order:

1. **Compliance and data residency.** If the data must stay in India, `ap-south-1` or `ap-south-2` is not optional.
2. **Latency to your users.** Round trip time from a user to the Region dominates perceived speed for interactive apps.
3. **Service availability.** New services and instance types roll out to a handful of Regions first.
4. **Cost.** Prices differ by Region, sometimes by 20% or more for the same instance.

Most AWS services are *regional*: an S3 bucket, an EC2 instance, an RDS database all belong to exactly one Region. A few are *global*: IAM, Route 53, CloudFront, and the account itself.

## 2. Availability Zones

Inside a Region are two or more **Availability Zones** (AZs). An AZ is one or more discrete data centres with independent power, cooling, and networking, physically separated from the other AZs in the Region but connected to them by low-latency private fibre.

The design rule that follows is the most important sentence in this reading:

> A production workload runs in at least two Availability Zones.

If a single AZ loses power, the workload continues. AWS services with "Multi-AZ" in their name (RDS Multi-AZ, ALB across subnets in different AZs, EKS node groups spread over AZs) exist to make that rule cheap to follow.

AZ names like `ap-south-1a` are **mapped per account**. Your `ap-south-1a` may be a different physical AZ from another account's `ap-south-1a`. Use the AZ *ID* (`aps1-az1`) when you need to coordinate across accounts.

## 3. Edge locations

**Edge locations** are far more numerous than Regions and sit close to users in cities worldwide. They do not run your compute. They cache and terminate traffic for a small set of services:

- **CloudFront** serves cached content from the edge.
- **Route 53** answers DNS from the edge.
- **AWS Global Accelerator** routes traffic onto the AWS backbone at the nearest edge.

If you remember one thing: edge locations make things *faster* for users; Regions and AZs make things *exist* and *survive*.

## 4. Accounts

An **AWS account** is the top-level container for resources, identity, and billing. Everything you create is scoped to an account, and an account can use any Region.

Organisations run many accounts on purpose. One account per environment (dev, staging, prod) or per team limits blast radius: a bad IAM policy or a runaway script in one account cannot reach another. AWS Organizations groups accounts under one bill and one set of guardrails.

AventiqLab itself follows this pattern. Alchemy, ASTRA, Arena, and the learner platform each run in their own account.

## Putting it together

| Concept | Scope | Question it answers |
|---|---|---|
| Account | Global | Who owns and pays for this? |
| Region | Geographic area | Where in the world does this live? |
| Availability Zone | Isolated site within a Region | What fails independently? |
| Edge location | City-level point of presence | How close to the user is the first hop? |

When you sketch an architecture, draw the account boundary first, then the Region, then the AZs inside it. The diagram in `assets/architecture.svg` shows the shape.

## Check yourself

Before the quiz, answer without looking back:

- Why can two accounts disagree about which physical site `ap-south-1a` is?
- Name a service that is global rather than regional.
- A customer in Mumbai reports slow page loads from your `us-east-1` app. Which of the four concepts is the fix, and which is not?
