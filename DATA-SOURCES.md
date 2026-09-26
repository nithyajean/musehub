# Third-party data sources and assets

House licensing rule: before any third-party input ships, its terms are read and
the exact granting sentence is recorded here. If the grant cannot be quoted, the
input does not ship.

## Web fonts (runtime, loaded from the Google Fonts CDN)

`apps/dashboard/index.html` links three families from `fonts.googleapis.com`.
The files are not copied into this repository and are not redistributed by us.

**Position on obligations.** The SIL Open Font License attaches its notice
requirement to redistributing the Font Software. Our dashboard references fonts
hosted by a third party, which is use rather than redistribution, so the notice
obligation does not attach to this repository today. If we ever self-host the
font files, we become a redistributor and must ship the OFL text plus each
copyright notice alongside them. Revisit this section at that point.

| Family | Licence | Status |
| --- | --- | --- |
| Bricolage Grotesque | SIL Open Font License 1.1 | VERIFIED upstream |
| JetBrains Mono | SIL Open Font License 1.1 | VERIFIED upstream |
| Instrument Sans | SIL Open Font License 1.1 (expected) | UNVERIFIED, see below |

Verified copyright lines, read from the upstream projects:

> Copyright 2022 The Bricolage Grotesque Project Authors
> (https://github.com/ateliertriay/bricolage)
> This Font Software is licensed under the SIL Open Font License

> Copyright 2020 The JetBrains Mono Project Authors
> (https://github.com/JetBrains/JetBrainsMono)
> This Font Software is licensed under the SIL Open Font License

The OFL clause that would bind a redistributor, quoted:

> contains the above copyright notice and this license. These can be included
> either as stand-alone text files, human-readable headers or in the appropriate
> machine-readable metadata fields within text or binary files as long as those
> fields can be easily viewed by the user.

**Open item.** Instrument Sans is served by Google Fonts under the same OFL
terms by every indication, but the upstream licence file did not resolve at the
path checked, so its clause is not yet quoted here. Confirm it against the
project's own repository before this repository is made public. Until then the
claim above is marked unverified rather than asserted.

**Privacy and availability note**, separate from licensing: linking the Google
CDN means every visitor's browser contacts Google. The typography degrades
to system fallbacks if that CDN is unreachable. Self-hosting removes both
effects and is worth weighing before launch, at the cost of taking on the
redistribution obligations above.

## Runtime and build dependencies

Package dependencies and their licences are listed in `NOTICE`. That list is
seeded and must be reconfirmed against the pinned lockfile before this
repository is made public.

## Demo and media assets

None at present. Any image, audio track or dataset added later needs its own row
here with the granting sentence quoted, before it ships.
