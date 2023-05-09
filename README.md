# SupaFly

This easiest way to deploy Supabase to Fly.io


<img src="https://user-images.githubusercontent.com/51415676/236983368-caac8b95-c266-4193-a14b-d5fab8766e10.png" width=50% height=50%>

## Features
- Uses new [Fly.io Apps v2](https://fly.io/docs/reference/apps/) platform
- Uses Fly's [private networking](https://fly.io/docs/reference/private-networking/)
> Applications within the same organization are assigned special addresses ("6PN addresses") tied to the organization. Those applications can talk to each other because of those 6PN addresses, but applications from other organizations can't; the Fly platform won't forward between different 6PN networks.
- Turborepo to make it easy to build off of

## Pre-requisites

Run the following command:

- [x] Fly.io CLI tool installed
- [x] Wireguard installed
- [x] Add card to Fly.io account / organazation

### Install [flyctl](https://fly.io/docs/hands-on/install-flyctl/), or the Fly.io CLI tool

```sh
brew install flyctl
```

### [Wireguard Installation Instructions](https://www.wireguard.com/install/)

### We recommend creating a new organaztion for your SupaFly project

> If you don't pass in a value for `--org` it will default to your personal organazation

## Deploying SupaFly

```sh
pnpm install
pnpm takeoff
```

<img width="546" alt="PNG image" src="https://user-images.githubusercontent.com/51415676/236983392-fa4631ab-90c7-44c7-83dd-db470bc3d7f8.png">

## Infastrcuture Deployed
- Supabase flavor, postgres database
- [Postgres-meta](https://github.com/supabase/postgres-meta)
- [Supabase Auth Service](https://github.com/supabase/auth-helpers)
- [PostgREST](https://github.com/PostgREST/postgrest)
- [Api Gateway (kong)](https://docs.konghq.com/gateway/latest/production/deployment-topologies/db-less-and-declarative-config/)
- [Supabase Studio](https://github.com/supabase/supabase/tree/master/studio)

## Things to work on

- Suapbase Auth Deployment
- Postgrest alpine image
- issues persisting data with database redeployments
- Pass in passwords for postgres roles
- Better name generatortion for supabase services

[SupaFly Progress Tracker](https://github.com/users/nicholasoxford/projects/1/views/1)

## How I created this
- Got inspired by @kiwicopple [Reddit comment](https://www.reddit.com/r/Supabase/comments/s9rdfd/globally_distributed_postgres_with_supabase/) about deploying Supabase DB to Fly
- Took the supabase [Dockercompose](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml) file and created fly services for each


