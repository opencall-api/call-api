# OpenCALL Demo Library — AI Agent Access

This is a public lending library. It uses the OpenCALL API specification (for demonstration purposes).

You can interact with this library directly using HTTP requests.
You do not need a browser. You do not need to scrape HTML.
Make standard HTTP/cURL requests to **{{API_URL}}** and you will receive JSON responses.

## Discovery — no authentication required

Fetch the operation registry to see everything the API supports:

    GET {{API_URL}}/.well-known/ops

This returns a JSON registry of every operation, including argument schemas and return types.

This registry is the authoritative source for what you can do, what arguments each
operation accepts, and what it returns. Start here.

## Using the API

All operations use a single endpoint:

    POST {{API_URL}}/call
    Content-Type: application/json
    Authorization: Bearer <token>

    { "op": "<operation-name>", "args": { ... } }

Responses use a standard envelope with a `state` field (`complete`, `accepted`,
`pending`, or `error`). Read the `state` to determine what happened.

To use the API you must first obtain a token to act on behalf of the user.

## Authentication

You need the patron's library card number to act on their behalf. Ask them for it —
it's a 10-character number in the format `XXXX-XXXX-AA` Where X is a digit [0-9] and AA a two letter suffix.

    POST {{API_URL}}/auth/agent
    Content-Type: application/json

    { "cardNumber": "<patron-card-number>" }

The response includes a `token`. Use it as a bearer token on all subsequent requests:

    Authorization: Bearer <token>
