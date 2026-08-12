# Contributing

Thanks for helping improve TupTup Online MIDI Piano.

## Before you start

- Search existing issues before opening a new one.
- Keep changes focused and explain the user impact.
- Never include MIDI device serial numbers, access tokens, or other private
  machine data in issues, screenshots, commits, or logs.

## Development workflow

1. Fork the repository and create a branch from `main`.
2. Install dependencies with `npm ci`.
3. Make the change and add or update tests when behavior changes.
4. Run the required checks:

   ```bash
   npm run lint
   npm run typecheck
   npm test
   ```

5. Open a pull request using the repository template.

Use descriptive branch names such as `fix/sam5704-input` or
`feat/instrument-selector`. Prefer small commits with imperative messages.

## Testing MIDI changes

Include the browser, operating system, controller model, visible input-port
names, and a short sample of sanitized MIDI bytes. Confirm at minimum:

- Note On and Note Off update the matching visual key.
- Velocity changes the meter and synthesized note level.
- A chord can light multiple keys simultaneously.
- Sustain CC 64 holds and releases notes correctly.
- Disconnecting and reconnecting the controller recovers without reloading.

## Pull requests

Pull requests should describe what changed, why it changed, how it was tested,
and any browser or hardware limitations. Maintainers may request that unrelated
changes be split into a separate pull request.

By contributing, you agree that your contribution is licensed under the MIT
License used by this repository.
