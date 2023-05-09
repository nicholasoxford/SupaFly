# SupaFly

This easiest way to deploy Supabase to Fly.io

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

## Things to work on

- Suapbase Auth Deployment
- Postgrest alpine image
- issues persisting data with database redeployments
- Pass in passwords for postgres roles
- Better name generatortion for supabase services
