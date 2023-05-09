# SupaFly

This easiest way to deploy Supabase to Fly.io

![Group 1](https://user-images.githubusercontent.com/51415676/236983368-caac8b95-c266-4193-a14b-d5fab8766e10.png)

## Features
- Uses new [Fly.io Apps v2](https://fly.io/docs/reference/apps/) platform
- Uses Fly's [private networking](https://fly.io/docs/reference/private-networking/)
> Applications within the same organization are assigned special addresses ("6PN addresses") tied to the organization. Those applications can talk to each other because of those 6PN addresses, but applications from other organizations can't; the Fly platform won't forward between different 6PN networks.


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


## Things to work on

- Suapbase Auth Deployment
- Postgrest alpine image
- issues persisting data with database redeployments
- Pass in passwords for postgres roles
- Better name generatortion for supabase services

[SupaFly Progress Tracker](https://github.com/users/nicholasoxford/projects/1/views/1)
