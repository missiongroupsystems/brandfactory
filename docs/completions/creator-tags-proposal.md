# Creator tags: proposal

The team finds creators by what they make content about ("italian food", "wine", "family"), but
the roster only has one coarse `category` and free-text notes. This proposal gives each creator a
few short topic tags, filled in by a model from what we already know, and corrected by people.

## What people see

- The Creators sidebar shows a creator's tags as chips under the name. A chip has a quiet ×; a
  small field at the end adds one (Enter adds it). Nothing else is new.
- The Creators search matches tags as it matches names and handles.
- No new filter, label or badge. Tags the team typed and tags the model gave look the same.

## Where tags come from

1. **People.** Any member of the creator's company adds or removes a tag. A person's choice wins:
   a tag a person added is never taken away by the model, and a tag a person removed is never put
   back by the model.
2. **The model.** A job on the server (packages/connect, Fly app `brandfactory`) reads the team's
   notes, the creator's category, and the creator's Instagram bio (Business Discovery `biography`,
   read through a brand's Instagram account linked by our own Meta app, as the picture job does).
   It asks OpenRouter for at most six tags, and sends the company's current tags so the model
   reuses them and the vocabulary stays small. It runs again when the notes, the category or the
   bio change.

## The model call

Direct from the server to OpenRouter, not through Bubbles (Bubbles is a chat agent). The same
model as Bubbles, `deepseek/deepseek-v4.1-flash`, overridable. A key of its own
(`TAGS_OPENROUTER_API_KEY`), so OpenRouter's own credit limit can cap it apart from Bubbles. A
daily cap in code from OpenRouter's reported cost (default $1 a day), the provider rules Bubbles
uses (no data collection), JSON output and a timeout. Without the key the job does not start and
tags only come from people.

What the model gets: the handle, the category, the bio and the notes (cut to 4000 characters).
Never a name, a token or any other field. The notes can hold rates and remarks about people;
OpenRouter is told to route only to providers that do not keep or train on the data.

## Not in this proposal

A tag filter beside the search, tags on the post page, tags for saved collaborators who are not on
the roster, and tags in other languages than plain lower-case ASCII.
