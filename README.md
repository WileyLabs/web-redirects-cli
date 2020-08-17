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


Next install the script, and run it.
```sh
$ npm i
$ redirects -h
```

```
redirects <cmd> [args]

Commands:
  redirects zones          List zones in current Cloudflare account
  redirects show [domain]  Show current redirects for [domain]
  redirects check [domain]  Check a [domain]'s settings and redirects
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
  "cloudflare:id":"z14...r72",
  "name":"example.com",
  "redirects": [
    {
      "base": "*example.com",
      "from": "/(.*)",
      "to": "https://example.org/$1",
      "status": 301
    },
    {
      "base": "www.example.com",
      "from": "/only-on-www",
      "to": "https://example.org/www-was-here",
      "status": 301
    }
  ]
}
```

The `redirects.base` key, if absent is presumed to be `*${name}/*` when
creating Page Rule based redirects.

## License

MIT
