# Web Redirects

Managing a wide range of Web (HTTP and HTTPS) redirects can be challenging,
confusing, and cumbersome. This project aims to provide a descriptive approach
to defining what redirects should exist per domain name.

## Usage

This project is currently aimed at coordinating descriptive redirect documents
(available in JSON or YAML) and converting them into Cloudflare Page Rules
(and eventually Cloudflare Worker-backed routers).

Step one (consequently) is to [get a Cloudflare API Token setup for your
account](https://support.cloudflare.com/hc/en-us/articles/200167836-Managing-API-Tokens-and-Keys#12345680) with "Read all resources" permission. Unless you are a "Super Administrator"
you will likely have to remove some of those perset permissions as your account
does not have permission to read all resources. Note: The longer term goal is
to also request edit level permissions (to manage/populate redirects) and to
only request the specific permissions needed to make these transactions.

Once you have that API Token, set it as an environment variable (and store it
somewhere safely that you can rereference!):

```sh
$ export WR_CLOUDFLARE_TOKEN=r98...z4
```
Note: You can also pass this token in as a command line parameter
(i.e. `--cloudflareToken`) if you'd prefer.


Next install the script, and run it to see the help information:
```sh
$ npm i
$ redirects -h
redirects <cmd> [args]

Commands:
  redirects zones             List zones in current Cloudflare account
  redirects show [domain]     Show current redirects for [domain]
  redirects check [domain]    Check a [domain]'s settings with [configDir]'s
                              default configuration (`.settings.yaml`)
  redirects compare [domain]  Compare [configDir]'s local redirect descriptions
                              for [domain] with Cloudflare's
```

Currently, all the comands require the `--cloudflareToken` which can also be
set as an environment variable: `WR_CLOUDFLARE_TOKEN`.

Additionally, the redirect descriptions are managed in a single directory who's
path can be set using the `--configDir` or `WR_CONFIG_DIR` environment
variable. It does default to `.`, so if you're running `redirects` in your
config/redirects folder, then you can avoid setting it.

Alternatively, you can create a `.env` file in the directory from which you
plan to run the `redirects` command.

For example:
```sh
# .env
WR_CLOUDFLARE_TOKEN="H32...23H"
WR_ACCOUNT_ID="..."
WR_WORKER_KV_NAMESPACE="..."
WR_CONFIG_DIR="redirects/"
```

## Settings and Redirects Directory

Create a directory (typically `domains/` or `redirects/`) anywhere you'd like
to track such things. To get all your redirects on the same foundation, add a
`.settings.yaml` file to that directory. Here's a starter (with some tweaks to
Cloudflare's defaults):
```yaml
---
# Standard settings for all redirect zones
always_use_https: "on"
ipv6: "on"
min_tls_version: "1.2"
security_header:
  strict_transport_security:
    enabled: true
    max_age: 0
    include_subdomains: true
    preload: true
    nosniff: true
ssl: "full"
```

Each key maps to a [Cloudflare Zone
Setting](https://api.cloudflare.com/#zone-settings-properties).

The `check` command will explain where things differ between the
`.settings.yaml` contents, and the currently selected zone.

Once that's created, you can add additional "Redirect Documents" to the
directory--one per zone name (typically the apex domain for your redirects).

## Write a Redirect Document

NOTE: this is a description of where this project is headed...not where it is
...yet.

First, create a directory to hold your redirects.

Then, within that directory, add a JSON file per zone/site/domain which you
will (or have) setup in Cloudflare and use the following format:

```json
{
  "cloudflare:id": "z14...r72",
  "fallthrough": false,
  "name": "example.com",
  "redirects": [
    {
      "from": "/(.*)",
      "to": "https://example.org/$1",
    },
    {
      "base": "www.example.com",
      "from": "/only-on-www",
      "to": "https://example.org/www-was-here",
      "status": 301,
      "caseSensitive": false,
      "includeParams": false
    }
  ]
}
```

The `fallthrough` key, if set to true - allows requests that are not redirected 
to continue processing (e.g. serve content from a defined DNS entry) - rather
than the default behaviour (`"fallthrough": false`) which will return a 404 response.

The `redirects.base` key, if absent is presumed to be `*${name}/*` when
creating Page Rule based redirects.

The `redirects.status` key, if not specified has a default value of `301`.

The `redirects.caseSensitive` key, if not specified has default value of `false`.

The `redirects.includeParams` key, if not specified has default value of `false`.
By default only the request path will be matched. If `"includeParams": true` then
the request query string will be included in the redirect matching.

## Deployments (Using Wrangler)

With the ongoing development of the worker script, and the inclusion of NodeJS dependencies
it has been necessary to use Wrangler to deploy changes. As a result the script should be deployed
as described here.

### Wrangler Installation

Wrangler v2 should be installed for the deployment of the `web-redirects-cli` worker. 

Find instructions here: https://developers.cloudflare.com/workers/wrangler/install-and-update/

```
> wrangler -v
```

### Wrangler Configuration (wrangler.toml)

The `wrangler.toml` file should be the 'source of truth' for the Worker configuration.
Though we won't store worker route/custom domain information here - that will be managed 
via the `web-redirects-cli` CLI and redirects YAML files.

Find more details here: https://developers.cloudflare.com/workers/wrangler/configuration/

### Deploying Changes

To deploy the worker to production or non-production you will need to login via `wrangler`

```
> wrangler login 
...
```

This will redirect you to your default browser - to login to Cloudflare and grant authorization to `wrangler`.
Once logged in you can check your current access using the `whoami` sub-command.

```
> wrangler whoami
...
```

If required, you can log out after completing a deployment.

```
> wrangler logout
```

By default Wrangler will publish Worker script changes using a non-production service name
(the default configuration defined in `wrangler.toml`). To deploy using the production service name, the environment
must be specified:

Default (non-prod)
```
> wrangler deploy
```

Deploy to Production
```
> wrangler deploy --env production
```

## License

MIT
