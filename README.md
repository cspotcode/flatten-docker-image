Script to flatten a docker image into a single layer, preserving metadata like env vars and entrypoint.

Usage:

```shell
# One-off invocation
# -y suppresses confirmation prompt
npx -y cspotcode/flatten-docker-image --help
npx -y cspotcode/flatten-docker-image <image tag or ID>

# To install globally
npm install -g cspotcode/flatten-docker-image
flatten-docker-image <image tag or ID>
```
