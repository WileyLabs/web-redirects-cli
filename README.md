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
```

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
      "from": "/(.*)",
      "to": "https://example.org/$1",
      "status": 301
    }
  ]
}
```

## License

MIT
