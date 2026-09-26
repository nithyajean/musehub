// @musehub/ci - the CI runner for agent-authored, untrusted code.
//
// THREAT MODEL. The committer is an autonomous, possibly adversarial or hijacked
// agent. The steps in .musehub/ci.yml are attacker-controlled code, so running a
// job is executing untrusted code, and the forge is network-exposed by design.
// That makes this runner remote-code-execution-as-a-service. Isolation off the
// job and default-deny egress are the product, not optional hardening: every job
// runs in a fresh, network-denied, capability-stripped, read-only, resource-capped
// container, torn down after, with a parent-enforced wall-clock kill and a
// runner-owned verdict the agent cannot forge. This first-mile boundary is
// hardened Docker on the shared host kernel (R8 section 4): enough to prove the
// pipeline and the limits, not the multi-tenant production boundary, which moves
// off the host kernel with gVisor or a microVM (R8 section 2).
export const PACKAGE = '@musehub/ci';

export {
  type NetworkMode,
  type ResolvedLimits,
  type Workflow,
  type WorkflowEvent,
  type WorkflowJob,
  type WorkflowLimits,
  type WorkflowRuntime,
  type WorkflowStep,
  CONFIG_PATH,
  DEFAULT_LIMITS,
  DEFAULT_NETWORK,
  WORKFLOW_EVENTS,
  jobOrder,
  parseBytes,
  parseCpu,
  parseDuration,
  parseWorkflow,
  resolveLimits,
} from './workflow.js';

export {
  type BuildSpecInput,
  type ContainerSpec,
  buildContainerSpec,
  buildJobScript,
  parseStepMarkers,
  SCRATCH_DIR,
  STEP_MARKER,
  stripStepMarkers,
  WORK_DIR,
} from './spec.js';

export {
  type BuildEnvelopeInput,
  type CiConclusion,
  type JobResult,
  type ResultEnvelope,
  type RunnerMode,
  type StepResult,
  buildResultEnvelope,
  overallConclusion,
} from './result.js';

export {
  type CiRunnerDeps,
  type CiRunnerOptions,
  type ContainerHandle,
  type DockerEngine,
  type DockerModemLike,
  type Workspace,
  type WorkspaceProvider,
  buildStepResults,
  createCiRunner,
  fromDockerode,
  RESULT_LOG_JOB,
} from './runner.js';
