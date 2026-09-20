## Inspect (Slides)

Use `presentation.inspect()` to generate a **grep-first JSONL snapshot** of a deck.
It’s the fastest way for an agent to understand a user-uploaded PPTX, find the right edit target, and then do precise edits via `presentation.resolve("<id>")`.

The loop is:

- Run `inspect` (small output, anchored IDs)
- `rg`/`grep` locally to find text / placeholders / notes / comments
- Copy an anchor id (`sl/...`, `sh/...`, `tb/...`, `ch/...`, `im/...`, `nt/...`, `th/...`, `tr/...`)
- Edit via the normal JS APIs
- Re-run `inspect` (usually targeted to one slide) to verify

---

### Quick Start

```python
from presentation_artifact_tool import Blob, PresentationFile


presentation = PresentationFile.import_pptx(Blob.load("existing_presentation.pptx"))
result = presentation.inspect({
    "kind": "deck,slide,textbox,shape,table,chart,image,notes,thread",
    "max_chars": 1200,
})
print(result)
```

### Return shape

`inspect` returns an object with both the JSONL and parsing metadata:

```python
result = presentation.inspect({ "kind": "slide,textbox" })

result.ndjson; # string (JSONL)
result.truncated; # boolean
result.metadata.notic[... ELLIPSIZATION ...]List"
```

