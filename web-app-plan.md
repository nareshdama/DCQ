# DCQ.io Web App Plan

## What “Web App” Means Here
The current project already has a browser frontend in `gui-shell`, but it is still a local workstation product:
- the frontend talks to `http://127.0.0.1:8008`
- CadQuery code executes inside a local Python process
- exports are written to local disk
- startup is driven by local PowerShell scripts

A real web app version means:
- the frontend is served over HTTPS
- CadQuery execution happens on remote infrastructure
- jobs, exports, and sessions are managed server-side
- users can open the app from a browser without installing Python locally

## Core Constraint
This is not a normal CRUD web app. The hardest problem is not the UI, it is safe and reliable remote execution of user-supplied Python/CadQuery code.

That drives the entire architecture.

## Recommended Product Model
Build this as a browser client plus a remote execution platform.

Recommended mode
- multi-user web app
- frontend on Vercel or static hosting
- Python execution on isolated worker containers
- object storage for STL/STEP artifacts
- database for users, projects, jobs, and metadata

Do not do this
- run arbitrary CadQuery code inside the main FastAPI server process
- store exported geometry only on local disk
- keep the API hardcoded to localhost
- expose a shared interpreter to all users

## Recommended Architecture

### 1. Frontend
Responsibility
- browser UI
- code editing
- example loading
- job submission
- live job status
- preview loading from signed asset URLs

Tech
- keep React + Vite initially
- later decide whether to stay on Vite SPA or move to Next.js if auth, routing, and project pages become more complex

Immediate changes
- replace hardcoded API origin with environment config
- support authenticated requests
- support polling or websocket/SSE job updates

### 2. API Layer
Responsibility
- auth
- project CRUD
- job submission
- job status
- asset metadata
- example library APIs

Recommended stack
- FastAPI can stay
- split the current bridge responsibilities into:
  - control API
  - execution worker service

Suggested API surface
- `POST /projects`
- `GET /projects/:id`
- `POST /jobs/run`
- `GET /jobs/:id`
- `GET /jobs/:id/events`
- `GET /assets/:id`
- `GET /examples`
- `GET /examples/:name`

### 3. Execution Workers
Responsibility
- run user CadQuery scripts
- produce diagnostics
- export STL and STEP
- upload results to object storage

Required design
- one isolated runtime per job
- strict CPU, memory, and timeout limits
- no shared writable filesystem between users
- no direct internet access from execution containers unless explicitly required

Recommended implementation
- queue a job from FastAPI
- dispatch to a worker pool
- run each job in an ephemeral container
- destroy the container after completion

Possible worker backends
- Docker-based worker pool on a VM
- Kubernetes jobs
- serverless containers if CadQuery cold start is acceptable

### 4. Storage
Responsibility
- source code versions
- export files
- job logs
- example metadata

Recommended storage split
- Postgres:
  - users
  - projects
  - revisions
  - jobs
  - asset metadata
- object storage:
  - STL
  - STEP
  - optional thumbnails
  - optional saved previews

Examples
- Postgres on Neon, Supabase, RDS, or managed Postgres
- object storage on S3, R2, or GCS

### 5. Realtime Layer
Responsibility
- run progress
- job status updates
- completion notifications

Recommended approach
- start with polling for MVP
- move to SSE for job status and logs
- use websockets only if collaborative editing or advanced multi-panel sync becomes necessary

### 6. Authentication
Responsibility
- user identity
- project ownership
- access control
- job isolation

Recommended approach
- use managed auth first
- examples: Clerk, Auth0, Supabase Auth

Access model
- private projects by default
- explicit sharing later
- signed URLs for export downloads

## Deployment Strategy

### Option A: Personal Hosted Web App
Best for
- single user
- internal tool
- fastest path

Architecture
- one VM
- nginx or Caddy
- FastAPI app
- worker process
- local Docker for job isolation
- local or mounted storage

Pros
- fastest to ship
- cheapest to validate

Cons
- weak scaling story
- more ops burden
- still needs careful sandboxing

### Option B: Proper Multi-User SaaS
Best for
- external users
- shared projects
- commercial direction

Architecture
- static frontend hosting
- FastAPI control plane
- queue
- isolated worker pool
- Postgres
- object storage
- auth provider

Pros
- correct long-term structure
- scalable
- cleaner separation of concerns

Cons
- more setup
- more infrastructure decisions up front

## Recommended Rollout
Choose Option A first if the goal is speed.
Choose Option B first if the goal is productization.

Given the current codebase, I recommend:
1. ship a deployable single-user hosted version
2. refactor execution into a job model
3. then harden into a multi-user architecture

## Phased Plan

### Phase 0: Make the Current Frontend Deployable
Goal
- remove localhost assumptions

Tasks
- move API origin from `gui-shell/src/api.ts` to env variables
- add production build config for `gui-shell`
- serve frontend from a hosted domain
- keep examples API server-side

Acceptance criteria
- the frontend loads from a remote URL
- the app can call a remote API origin

### Phase 1: Split Control Plane from Execution
Goal
- stop treating CadQuery execution as a direct request/response function

Tasks
- turn `/run` into a job creation endpoint
- create `job_id`, status, created_at, finished_at
- persist job metadata
- return structured job states

Job states
- queued
- running
- succeeded
- failed
- expired

Acceptance criteria
- frontend submits work as jobs
- job state can be retrieved independently of the request lifecycle

### Phase 2: Introduce Isolated Worker Execution
Goal
- execute CadQuery safely outside the main API process

Tasks
- create worker image with CadQuery and export dependencies
- execute each run inside an ephemeral container
- enforce time, CPU, and memory limits
- capture stdout, stderr, and structured diagnostics

Acceptance criteria
- user code no longer runs inside the main FastAPI server process
- failed or hanging jobs cannot block the API

### Phase 3: Add Durable Storage
Goal
- make projects and exports persistent

Tasks
- add Postgres schema for users, projects, revisions, jobs, assets
- upload STL and STEP files to object storage
- replace local `exports/` serving with signed URLs or proxy endpoints

Acceptance criteria
- completed job artifacts survive restarts
- users can revisit old runs and re-download exports

### Phase 4: Add Auth and Project Model
Goal
- make the app usable by real accounts

Tasks
- add sign-in
- associate projects and jobs with users
- create project list and saved file model
- add revision history

Acceptance criteria
- users can sign in, save work, reopen work, and rerun previous revisions

### Phase 5: Improve Web UX for Remote Execution
Goal
- make remote compute feel responsive

Tasks
- add queued/running states in the UI
- add run history panel
- add incremental logs or status events
- add optimistic shell behavior while waiting for worker completion

Acceptance criteria
- remote execution feels understandable rather than laggy
- users always know whether a run is queued, running, failed, or done

### Phase 6: Harden Security and Operations
Goal
- make the system safe enough for internet exposure

Tasks
- rate limiting
- per-user quotas
- input size limits
- timeout and memory guardrails
- audit logging
- signed asset access
- container image hardening
- dependency and CVE monitoring

Acceptance criteria
- one user cannot starve the platform
- code execution is isolated and observable

### Phase 7: Collaboration and Advanced Features
Goal
- extend from single-user execution tool to platform

Possible features
- shareable projects
- public examples gallery
- parameter panels
- generated preview thumbnails
- team workspaces
- collaborative comments

## Suggested Data Model

### Users
- id
- email
- created_at

### Projects
- id
- owner_id
- name
- created_at
- updated_at

### Revisions
- id
- project_id
- code
- created_at
- created_by

### Jobs
- id
- project_id
- revision_id
- status
- started_at
- finished_at
- stdout
- stderr
- diagnostics_json

### Assets
- id
- job_id
- kind
- storage_key
- content_type
- byte_size

## API Evolution from Current Code
Current endpoints in `gui-bridge/server.py`
- `/run`
- `/examples`
- `/examples/{file_name}`
- `/convert-step-export`
- `/convert-step-upload`

Recommended future direction
- keep examples endpoints
- replace direct `/run` with async job endpoints
- reduce ad hoc conversion endpoints by treating conversions as jobs or asset transforms
- stop serving exports from local filesystem paths as the main production strategy

## Security Requirements
Non-negotiable
- no shared interpreter
- no unlimited runtime
- no unrestricted filesystem access
- no raw local path exposure
- no trust in user script content

Prefer
- network-disabled workers
- read-only container filesystem except temp workspace
- per-job temp directory
- explicit export whitelist

## MVP Recommendation
If the goal is to get to a hosted product quickly:

MVP stack
- React/Vite frontend
- FastAPI control API
- Postgres
- object storage
- Dockerized worker runner on one VM
- polling-based job status
- managed auth

This is the shortest path that is still architecturally sound.

## Success Criteria
- users can open the app in a browser with no local Python install
- runs are isolated and cannot crash the main API
- exports persist and can be downloaded later
- the UI clearly represents remote execution states
- the system can scale from one user to many without redesigning the core execution model
