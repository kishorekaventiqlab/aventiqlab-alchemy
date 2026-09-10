import type { Manifest } from "../types.js";

/** A minimal but complete, valid manifest. Tests clone and mutate it. */
export function validManifest(): Manifest {
  return {
    manifestVersion: "1",
    experienceId: "aws-global-infrastructure",
    version: "1.0.0",
    title: "AWS Global Infrastructure",
    summary: "Regions, Availability Zones, edge locations and accounts: the physical and logical shape of AWS.",
    domain: "aws",
    category: "cloud-foundations",
    level: "FOUNDATION",
    difficulty: 1,
    skills: {
      taught: [
        { skillId: "aws-regions", targetLevel: "knowledge", primary: true },
        { skillId: "availability-zones", targetLevel: "knowledge" },
      ],
      assessed: [{ skillId: "aws-regions", level: "knowledge", evidence: ["quiz"] }],
      required: [{ skillId: "cloud-computing-basics", minimumLevel: "exposure" }],
    },
    prerequisites: [{ experienceId: "cloud-computing-basics" }],
    targetAudience: { profiles: ["cloud-beginner"], experienceYears: { min: 0, max: 15 } },
    learningObjectives: [{ id: "lo-1", statement: "Explain what an AWS Region is and how to pick one.", skillIds: ["aws-regions"] }],
    artifacts: [
      { artifactId: "video-main", kind: "video", path: "video/main.mp4", contentType: "video/mp4" },
      { artifactId: "reading-main", kind: "reading", path: "reading/main.md", contentType: "text/markdown" },
      { artifactId: "quiz", kind: "quiz", path: "quiz/quiz.json", contentType: "application/json" },
    ],
    completionCriteria: { requiredArtifactIds: ["video-main", "reading-main"], quiz: { artifactId: "quiz", passingScorePercent: 70 } },
    masteryCriteria: { evidenceRequired: ["quiz"] },
  };
}
