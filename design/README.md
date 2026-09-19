# Interface mockups

Five screens for stage 1. These are the source files of a Claude artifact
canvas, so they are not standalone pages: they expect a `support.js` runtime
that is not in this repository, and opening one in a browser will show
nothing. Read them as markup, field lists and copy — that is what they are
here for.

The live, interactive version is the canvas:
https://claude.ai/artifact/N2kmEjbxcQBsgSRXx6SGJX

| File | Screen | Shows |
|---|---|---|
| `Main.dc.html` | Places list | Search, filters, table columns, status vocabulary |
| `PlaceEdit.dc.html` | Place record | The nested rooms block, primary-room selection |
| `EventEdit.dc.html` | Event record | The nested occurrences block, business-day wording |
| `ArtistEdit.dc.html` | Artist record | Members block, inline person picker, advisory validation |
| `PersonPicker.dc.html` | Create person | Duplicate warning, the privacy note on names |

The copy in these files is deliberate, not placeholder. The in-form
explanations of the business day, of "default place is not the place of a set"
and of the multi-venue rule exist because those are the three things an
operator gets wrong without them.

Layout, spacing and colours are a proposal, not a specification. The field
lists, the labels and the interaction — what is nested inside what, what
blocks a save and what only warns — are the part worth following.
